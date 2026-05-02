import http from "http";
import cors from "cors";
import { configDotenv } from "dotenv";
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

const CSRF_COOKIE_NAME = "csrfToken";
const CSRF_HEADER_NAME = "x-csrf-token";
const CSRF_PROTECTED_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const CSRF_COOKIE_OPTIONS = {
	httpOnly: false,
	secure: process.env.NODE_ENV === "production",
	sameSite: "strict",
	path: "/",
};

configDotenv();

class ServerBackend {
	constructor() {
		this.app = express();
		customPassport.setupPassport();
		this._initMiddleware();
		this._initRoutes();
		this.server = http.createServer(this.app);
		this.socketStarted = false;
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

		this.app.use((req, res, next) => {
			if (req.path.startsWith("/live/")) {
				return next();
			}

			if (!CSRF_PROTECTED_METHODS.has(req.method)) return next();

			let csrfToken = undefined;
			let csrfTokenCookie = req.cookies?.[CSRF_COOKIE_NAME];
			let csrfTokenHeader = req.get(CSRF_HEADER_NAME);
			
			if (!csrfTokenCookie && csrfTokenHeader) {
				res.cookie(CSRF_COOKIE_NAME, csrfTokenHeader, CSRF_COOKIE_OPTIONS);
				csrfToken = csrfTokenHeader;
			} else if (csrfTokenCookie && !csrfTokenHeader) {
				res.append(CSRF_HEADER_NAME, csrfTokenCookie);
				req.headers[CSRF_HEADER_NAME] = csrfTokenCookie;
				csrfToken = csrfTokenCookie;
			}
			
			if (csrfToken === undefined) {
				csrfToken = crypto.randomBytes(32).toString("hex");
				res.cookie(CSRF_COOKIE_NAME, csrfToken, CSRF_COOKIE_OPTIONS);
				res.append(CSRF_HEADER_NAME, csrfToken);
				req.headers[CSRF_HEADER_NAME] = csrfToken;
			}
			
			req.csrfToken = csrfToken;
			next();
		});

		this.app.use((req, res, next) => {
			if (req.path.startsWith("/live/")) {
				return next();
			}

			const cookieToken = req.cookies?.[CSRF_COOKIE_NAME];
			const headerToken = req.get(CSRF_HEADER_NAME);

			if (!cookieToken || !headerToken) {
				return res.status(403).json({ error: "Missing CSRF token" });
			}

			if (cookieToken !== headerToken) {
				return res.status(403).json({ error: "Invalid CSRF token" });
			}

			return next();
		});

		this.app.use(methodOverride());
	}

	_initRoutes() {
		this.app.use(routes);
	}

	async startBackend({ httpPort, startSockets = true } = {}) {
		try {
			liveRuntime.start();
			await databaseServer.startServer();

			if (startSockets) {
				socketBackend.start();
				this.socketStarted = true;
			}

			const resolvedPort = httpPort ?? process.env.PORT ?? 6001;

			await new Promise((resolve, reject) => {
				this.server
					.listen(resolvedPort, () => {
						logger.info(`HTTP server listening on port ${resolvedPort}`);
						resolve();
					})
					.on("error", (err) => {
						logger.error("HTTP server error:", err);
						reject(err);
					});
			});
		} catch (err) {
			logger.error("Failed to start backend:", err);
			throw err;
		}
	}

	async stopBackend() {
		try {
			liveRuntime.stop();

			if (this.socketStarted && socketBackend.io) {
				socketBackend.io.close(() => logger.info("Socket.IO server stopped"));
				this.socketStarted = false;
			}

			await databaseServer.stopServer();

			if (this.server.listening) {
				await new Promise((resolve, reject) => {
					this.server.close((err) => {
						if (err) return reject(err);
						logger.info("HTTP server stopped");
						resolve();
					});
				});
			}
		} catch (err) {
			logger.error("Error during shutdown:", err);
			throw err;
		}
	}

	async handleShutdown(signal) {
		try {
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
		process.on("SIGINT", async () => {
			await serverBackend.handleShutdown("SIGINT");
		});

		process.on("SIGTERM", async () => {
			await serverBackend.handleShutdown("SIGTERM");
		});

		try {
			await serverBackend.startBackend();
		} catch (e) {
			logger.error("Startup error:", e);
			process.exit(1);
		}
	})();
}

export { ServerBackend, serverBackend };
export default serverBackend;
