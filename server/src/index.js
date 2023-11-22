import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import cors from "cors";
import logger from "./logging/logger.js";
import dotenv from "dotenv";
import http from "http";

import databaseServer from "./mongoServer.js";

dotenv.config();

class ServerBackend {
  constructor() {
    this.app = express();
    this.initializeMiddleware();
    this.server = http.createServer(this.app);
  }

  initializeMiddleware() {
    this.app.use(cors({ optionsSuccessStatus: 200 }));
    this.app.use(express.json());
    this.app.use(helmet());

    this.configureLogger();
  }

  configureLogger() {
    const morganOption = {
      stream: {
        write: (message) => logger.info(message.trim()),
      },
    };

    this.app.use(morgan("combined", morganOption));
  }

  async startBackend() {
    try {
      await databaseServer.startServer();
      const PORT = process.env.PORT || 3000; // Define a default port
      this.server.listen(PORT, () => logger.info(`Server started on port ${PORT}`));
    } catch (error) {
      logger.error("Failed to start the server:", error);
    }
  }

  async stopBackend() {
    try {
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

  // Ensure backend stops gracefully on SIGINT signal
  process.on("SIGINT", async () => {
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
