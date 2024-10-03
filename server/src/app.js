import express from "express";
import morgan from "morgan";
import cors from "cors";
import logger from "./logger.js";
import { configDotenv } from "dotenv";
import http from "http";
import methodOverride from "method-override";
import session from "express-session";

import databaseServer from "./database/index.js";
import socketBackend from "./socketio/index.js";
import customPassport from "./config/passport.js";
import routes from "./routes/index.js";
import passport from "passport";

configDotenv();

class ServerBackend {
	constructor() {
		this.app = express();
		customPassport.setupPassport();
		this.initializeMiddleware();
		this.initializeRoutes();
		this.server = http.createServer(this.app);
	}

	initializeMiddleware() {
		this.app.use(cors({ optionsSuccessStatus: 200 }));
		this.configureLogger();

		this.app.use(express.urlencoded({ extended: false }));
		this.app.use(express.json());

		this.app.use(methodOverride());
	}

	configureLogger() {}

	initializeRoutes() {
		this.app.use(routes);
	}

	async startBackend() {
		try {
			await databaseServer.startServer();
			try {
				socketBackend.startListening();
			} catch (socketError) {
				logger.error("Failed to start socket backend:", socketError);
				throw socketError;
			}
			const PORT = process.env.PORT || 6001; // Define a default port
			this.server
				.listen(PORT, () => logger.info(`Server started on port ${PORT}`))
				.on("error", (err) => {
					logger.error("Server listener error:", err);
					process.exit(1);
				});
		} catch (error) {
			logger.error("Failed to start the server:", error);
		}
	}

	async stopBackend() {
		try {
			socketBackend.stopListening();
			await databaseServer.stopServer();
			this.server.close(() => logger.info("Server gracefully stopped"));
		} catch (error) {
			logger.error("Error while stopping the server:", error);
			throw error;
		}
	}
}

// Initiate the server
(async () => {
	const serverBackend = new ServerBackend();

	// Ensure backend stops gracefully on SIGINT and SIGTERM signals
	process.on("SIGINT", async () => {
		try {
			await serverBackend.stopBackend();
			process.exit(0);
		} catch (e) {
			logger.error("Failed to shut down the server:", e);
			process.exit(1);
		}
	});

	process.on("SIGTERM", async () => {
		try {
			await serverBackend.stopBackend();
			process.exit(0);
		} catch (e) {
			logger.error("Failed to shut down the server:", e);
			process.exit(1);
		}
	});

	try {
		await serverBackend.startBackend();
	} catch (e) {
		logger.error("Startup error:", e);
		process.exit(1);
	}
})();
