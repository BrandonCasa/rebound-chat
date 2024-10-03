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

	configureLogger() {
		if (logger && logger.stream) {
			this.app.use(morgan("combined", { stream: logger.stream }));
		}
	}

	initializeRoutes() {
		this.app.use(routes);
	}

	async startBackend() {
		try {
			await databaseServer.startServer();
			let socketAttempts = 0;
			const maxSocketAttempts = 3;
			let socketStarted = false;

			while (socketAttempts < maxSocketAttempts && !socketStarted) {
				try {
					socketBackend.startListening();
					socketStarted = true;
				} catch (socketError) {
					socketAttempts++;
					logger.error(`Failed to start socket backend (attempt ${socketAttempts} of ${maxSocketAttempts}):`, socketError);
					if (socketAttempts >= maxSocketAttempts) {
						throw socketError;
					}
					await new Promise((resolve) => setTimeout(resolve, 2000)); // Wait before retrying
				}
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
			process.exit(1);
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

	async handleShutdown(signal) {
		try {
			await this.stopBackend();
			process.exit(0);
		} catch (e) {
			logger.error(`Failed to shut down the server on ${signal}:`, e);
			process.exit(1);
		}
	}
}

// Initiate the server
(async () => {
	const serverBackend = new ServerBackend();

	// Ensure backend stops gracefully on SIGINT and SIGTERM signals
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
