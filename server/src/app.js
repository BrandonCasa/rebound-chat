// src/server.js
import http from "http";
import cors from "cors";
import { configDotenv } from "dotenv";
import express from "express";
import rateLimit from "express-rate-limit";
import methodOverride from "method-override";
import morgan from "morgan";

import customPassport from "./config/passport.js";
import databaseServer from "./database/index.js";
import logger from "./logger.js";
import routes from "./routes/index.js";
import socketBackend from "./socketio/index.js";

configDotenv();

class ServerBackend {
	constructor() {
		this.app = express();
		customPassport.setupPassport();
		this._initMiddleware();
		this._initRoutes();
		this.server = http.createServer(this.app);
	}

	_initMiddleware() {
		// CORS
		this.app.use(cors({ optionsSuccessStatus: 200 }));
		// ─── GLOBAL RATE LIMITER ───────────────────────────────────────────────────
		// limit each IP to 150 requests per 5 minutes
		const globalLimiter = rateLimit({
			windowMs: 5 * 60 * 1000, // 5 minutes
			max: 150,
			standardHeaders: true,
			legacyHeaders: false,
			message: { error: "Too many requests, please try again later." },
		});
		this.app.use(globalLimiter);

		// HTTP request logging
		if (logger.stream) {
			this.app.use(morgan("combined", { stream: logger.stream }));
		}

		// Body parsing
		this.app.use(express.urlencoded({ extended: false }));
		this.app.use(express.json());

		// Method-override for PUT/DELETE in forms
		this.app.use(methodOverride());
	}

	_initRoutes() {
		this.app.use(routes);
	}

	async startBackend() {
		try {
			// 1) connect to database
			await databaseServer.startServer();

			// 2) start Socket.IO on its own port (default 6002)
			socketBackend.start();

			// 3) start HTTP server
			const httpPort = process.env.PORT || 6001;
			this.server
				.listen(httpPort, () => logger.info(`HTTP server listening on port ${httpPort}`))
				.on("error", (err) => {
					logger.error("HTTP server error:", err);
					process.exit(1);
				});
		} catch (err) {
			logger.error("Failed to start backend:", err);
			process.exit(1);
		}
	}

	async stopBackend() {
		try {
			// shut down Socket.IO
			if (socketBackend.io) {
				socketBackend.io.close(() => logger.info("Socket.IO server stopped"));
			}

			// shut down database
			await databaseServer.stopServer();

			// shut down HTTP
			this.server.close(() => logger.info("HTTP server stopped"));
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

(async () => {
	const serverBackend = new ServerBackend();

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
