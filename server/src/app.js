import http from "http";
import { config as configDotenv } from "dotenv";

import createApp from "./createApp.js";
import databaseServer from "./database/index.js";
import liveRuntime from "./live/runtime.js";
import logger from "./logger.js";
import { isDevCutoverRole } from "./runtime/dependencies.js";
import socketBackend from "./socketio/index.js";

configDotenv();

const SERVER_ROLES = new Set(["api", "worker", "combined", "realtime"]);
const ECS_SMOKE_MODE_ENV = "REBOUND_ECS_SMOKE_MODE";
const ECS_SMOKE_MODE_ROLES = new Set(["api", "worker"]);
const TRUTHY_ENV_VALUES = new Set(["1", "true", "yes"]);
const FALSEY_ENV_VALUES = new Set(["0", "false", "no"]);

const resolveServerRole = (value = process.env.SERVER_ROLE) => {
	const normalized = String(value || "")
		.trim()
		.toLowerCase();
	return SERVER_ROLES.has(normalized) ? normalized : "combined";
};

const resolveEcsSmokeMode = (env = process.env) => {
	const rawValue = env[ECS_SMOKE_MODE_ENV];

	if (rawValue === undefined || rawValue === null || rawValue === "") {
		return false;
	}

	const normalized = String(rawValue).trim().toLowerCase();
	if (FALSEY_ENV_VALUES.has(normalized)) {
		return false;
	}

	if (!TRUTHY_ENV_VALUES.has(normalized)) {
		throw new Error(`Invalid ${ECS_SMOKE_MODE_ENV}. Expected one of: 1, true, yes, 0, false, no.`);
	}

	const appEnv = String(env.APP_ENV || "")
		.trim()
		.toLowerCase();
	if (appEnv !== "dev") {
		throw new Error(`${ECS_SMOKE_MODE_ENV} can only be enabled with APP_ENV=dev.`);
	}

	return true;
};

class ServerBackend {
	constructor({
		role = process.env.SERVER_ROLE,
		env = process.env,
		ecsSmokeMode = resolveEcsSmokeMode(env),
		app = null,
		liveRuntime: liveRuntimeDependency = liveRuntime,
		databaseServer: databaseServerDependency = databaseServer,
		socketBackend: socketBackendDependency = socketBackend,
	} = {}) {
		this.env = env;
		this.role = resolveServerRole(role);
		this.ecsSmokeMode = Boolean(ecsSmokeMode);
		if (this.ecsSmokeMode && !ECS_SMOKE_MODE_ROLES.has(this.role)) {
			throw new Error(`${ECS_SMOKE_MODE_ENV} is only supported for api and worker roles.`);
		}
		this.liveRuntime = liveRuntimeDependency;
		this.databaseServer = databaseServerDependency;
		this.socketBackend = socketBackendDependency;
		this.app = app || createApp({ role: this.role, ecsSmokeMode: this.ecsSmokeMode, env: this.env });
		this.server = http.createServer(this.app);
		this.socketStarted = false;
		this.databaseStarted = false;
		this.cleanupStarted = false;
		this.realtimeStubTimer = null;
		this.smokeKeepAliveTimer = null;
		this.started = false;
	}

	_shouldStartHttp() {
		return this.role === "api" || this.role === "combined";
	}

	_shouldStartCleanup() {
		if (this.ecsSmokeMode) return false;
		return this.role === "worker" || this.role === "combined";
	}

	_shouldStartDatabase() {
		if (this.ecsSmokeMode) return false;
		if (isDevCutoverRole({ role: this.role, env: this.env })) return false;
		return this.role !== "realtime";
	}

	_shouldStartSockets(startSockets) {
		return this.role === "combined" && startSockets;
	}

	_startRealtimeStub() {
		if (this.realtimeStubTimer) return;

		this.realtimeStubTimer = setInterval(() => {
			logger.debug?.("Realtime role waiting for API Gateway WebSocket handler wiring");
		}, 60_000);
	}

	_startSmokeKeepAlive() {
		if (this.smokeKeepAliveTimer || this.role !== "worker") return;

		this.smokeKeepAliveTimer = setInterval(() => {
			logger.debug?.("Worker ECS smoke mode alive; product cleanup and database startup are intentionally disabled");
		}, 60_000);
	}

	async startBackend({ httpPort, startSockets = true } = {}) {
		if (this.started) {
			logger.warn("Backend is already started");
			return;
		}

		try {
			if (this.ecsSmokeMode) {
				logger.warn(`${ECS_SMOKE_MODE_ENV} enabled for role=${this.role}; skipping database and product worker startup`);
				this._startSmokeKeepAlive();
			}

			if (this._shouldStartCleanup()) {
				this.liveRuntime.start();
				this.cleanupStarted = true;
			}

			if (this._shouldStartDatabase()) {
				await this.databaseServer.startServer();
				this.databaseStarted = true;
			}

			if (this._shouldStartSockets(startSockets)) {
				const resolvedSocketPort = Number(process.env.REBOUND_SOCKET_PORT ?? Number(httpPort ?? process.env.PORT ?? 6001) + 1);
				this.socketBackend.start(resolvedSocketPort);
				this.socketStarted = true;
			}

			if (this.role === "realtime") {
				this._startRealtimeStub();
			}

			if (this._shouldStartHttp()) {
				const resolvedPort = Number(httpPort ?? process.env.PORT ?? 6001);

				await new Promise((resolve, reject) => {
					const onError = (err) => {
						this.server.off("error", onError);
						logger.error("HTTP server error:", err);
						reject(err);
					};

					this.server.once("error", onError);

					this.server.listen(resolvedPort, () => {
						this.server.off("error", onError);
						logger.info(`HTTP server listening on port ${resolvedPort} role=${this.role}`);
						resolve();
					});
				});
			} else {
				logger.info(`Backend role ${this.role} started without product HTTP listener`);
			}

			this.started = true;
		} catch (err) {
			logger.error("Failed to start backend:", err);

			try {
				await this.stopBackend();
			} catch (shutdownErr) {
				logger.error("Failed to clean up after startup error:", shutdownErr);
			}

			throw err;
		}
	}

	async stopBackend() {
		const errors = [];

		if (this.realtimeStubTimer) {
			clearInterval(this.realtimeStubTimer);
			this.realtimeStubTimer = null;
		}

		if (this.smokeKeepAliveTimer) {
			clearInterval(this.smokeKeepAliveTimer);
			this.smokeKeepAliveTimer = null;
		}

		if (this.server.listening) {
			try {
				await new Promise((resolve, reject) => {
					this.server.close((err) => {
						if (err) return reject(err);
						logger.info("HTTP server stopped");
						resolve();
					});
				});
			} catch (err) {
				errors.push(err);
			}
		}

		if (this.socketStarted && this.socketBackend.io) {
			try {
				await new Promise((resolve) => {
					this.socketBackend.io.close(() => {
						logger.info("Socket.IO server stopped");
						resolve();
					});
				});

				this.socketStarted = false;
			} catch (err) {
				errors.push(err);
			}
		}

		if (this.cleanupStarted) {
			try {
				this.liveRuntime.stop();
				this.cleanupStarted = false;
			} catch (err) {
				errors.push(err);
			}
		}

		if (this.databaseStarted) {
			try {
				await this.databaseServer.stopServer();
				this.databaseStarted = false;
			} catch (err) {
				errors.push(err);
			}
		}

		this.started = false;

		if (errors.length > 0) {
			const shutdownError = new Error("One or more errors occurred during shutdown");
			shutdownError.causes = errors;
			logger.error("Error during shutdown:", errors);
			throw shutdownError;
		}
	}

	async handleShutdown(signal) {
		try {
			logger.info(`Received ${signal}, shutting down...`);
			await this.stopBackend();
			process.exit(0);
		} catch (err) {
			logger.error(`Failed to handle ${signal}:`, err);
			process.exit(1);
		}
	}
}

const serverBackend = new ServerBackend();

if (process.env.NODE_ENV !== "test") {
	(async () => {
		process.once("SIGINT", () => {
			serverBackend.handleShutdown("SIGINT");
		});

		process.once("SIGTERM", () => {
			serverBackend.handleShutdown("SIGTERM");
		});

		try {
			await serverBackend.startBackend();
		} catch (err) {
			logger.error("Startup error:", err);
			process.exit(1);
		}
	})();
}

export { ECS_SMOKE_MODE_ENV, ServerBackend, resolveEcsSmokeMode, resolveServerRole, serverBackend };
export default serverBackend;
