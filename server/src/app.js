import http from "http";
import cors from "cors";
import { config as configDotenv } from "dotenv";
import crypto from "crypto";
import express from "express";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import methodOverride from "method-override";
import morgan from "morgan";

import customPassport from "./config/passport.js";
import databaseServer from "./database/index.js";
import liveRuntime from "./live/runtime.js";
import logger from "./logger.js";
import routes from "./routes/index.js";
import socketBackend from "./socketio/index.js";

import { buildCorsOptions } from "./config/cors.js";

configDotenv();

const CSRF_COOKIE_NAME = "csrfToken";
const CSRF_HEADER_NAME = "x-csrf-token";
const CSRF_PROTECTED_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

const CSRF_COOKIE_OPTIONS = {
	httpOnly: false,
	secure: process.env.NODE_ENV === "production",
	sameSite: process.env.NODE_ENV === "production" ? "strict" : "lax",
	path: "/",
};

class ServerBackend {
	constructor() {
		this.app = express();
		this.server = http.createServer(this.app);
		this.socketStarted = false;
		this.started = false;

		customPassport.setupPassport();

		this._initMiddleware();
		this._initRoutes();
	}

	_initMiddleware() {
		this.app.set("trust proxy", 1);

		this.app.use(cors(buildCorsOptions));
		this.app.options(/.*/, cors(buildCorsOptions));

		const globalLimiter = rateLimit({
			windowMs: 5 * 60 * 1000,
			max: 150,
			standardHeaders: true,
			legacyHeaders: false,
			message: { error: "Too many requests, please try again later." },
			skip: (req) => req.path.startsWith("/live/"),
		});

		this.app.use(globalLimiter);

		if (logger.stream) {
			this.app.use(morgan("combined", { stream: logger.stream }));
		}

		this.app.use(cookieParser());
		this.app.use(express.urlencoded({ extended: false }));
		this.app.use(express.json());

		// Apply method override before CSRF checks so overridden methods are protected correctly.
		this.app.use(methodOverride());

		this.app.use(this._csrfTokenMiddleware.bind(this));
		this.app.use(this._csrfProtectionMiddleware.bind(this));
	}

	_csrfTokenMiddleware(req, res, next) {
		if (req.path.startsWith("/live/")) return next();

		let csrfToken = req.cookies?.[CSRF_COOKIE_NAME];

		if (!csrfToken) {
			csrfToken = crypto.randomBytes(32).toString("hex");
			res.cookie(CSRF_COOKIE_NAME, csrfToken, CSRF_COOKIE_OPTIONS);
		}

		res.setHeader(CSRF_HEADER_NAME, csrfToken);

		// Allows browser clients to read x-csrf-token from fetch/XHR responses.
		const existingExposeHeaders = res.getHeader("Access-Control-Expose-Headers");

		if (existingExposeHeaders) {
			const exposeValue = String(existingExposeHeaders);

			if (!exposeValue.toLowerCase().includes(CSRF_HEADER_NAME)) {
				res.setHeader(
					"Access-Control-Expose-Headers",
					`${exposeValue}, ${CSRF_HEADER_NAME}`,
				);
			}
		} else {
			res.setHeader("Access-Control-Expose-Headers", CSRF_HEADER_NAME);
		}

		next();
	}

	_csrfProtectionMiddleware(req, res, next) {
		if (req.path.startsWith("/live/")) return next();
		if (!CSRF_PROTECTED_METHODS.has(req.method)) return next();

		const csrfTokenCookie = req.cookies?.[CSRF_COOKIE_NAME];
		const csrfTokenHeader = req.get(CSRF_HEADER_NAME);

		if (!csrfTokenCookie || !csrfTokenHeader) {
			return res.status(403).json({ error: "Missing CSRF token" });
		}

		if (
			typeof csrfTokenCookie !== "string" ||
			typeof csrfTokenHeader !== "string" ||
			csrfTokenCookie.length !== csrfTokenHeader.length
		) {
			return res.status(403).json({ error: "Invalid CSRF token" });
		}

		const cookieBuffer = Buffer.from(csrfTokenCookie, "utf8");
		const headerBuffer = Buffer.from(csrfTokenHeader, "utf8");

		if (!crypto.timingSafeEqual(cookieBuffer, headerBuffer)) {
			return res.status(403).json({ error: "Invalid CSRF token" });
		}

		req.csrfToken = csrfTokenCookie;

		next();
	}

	_initRoutes() {
		this.app.use(routes);
	}

	async startBackend({ httpPort, startSockets = true } = {}) {
		if (this.started) {
			logger.warn("Backend is already started");
			return;
		}

		try {
			liveRuntime.start();
			await databaseServer.startServer();

			if (startSockets) {
				// Prefer attaching Socket.IO to the same HTTP server.
				socketBackend.start(this.server);
				this.socketStarted = true;
			}

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
					logger.info(`HTTP server listening on port ${resolvedPort}`);
					resolve();
				});
			});

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

		if (this.socketStarted && socketBackend.io) {
			try {
				await new Promise((resolve) => {
					socketBackend.io.close(() => {
						logger.info("Socket.IO server stopped");
						resolve();
					});
				});

				this.socketStarted = false;
			} catch (err) {
				errors.push(err);
			}
		}

		try {
			liveRuntime.stop();
		} catch (err) {
			errors.push(err);
		}

		try {
			await databaseServer.stopServer();
		} catch (err) {
			errors.push(err);
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

export { ServerBackend, serverBackend };
export default serverBackend;
