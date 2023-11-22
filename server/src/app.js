import express from "express";
import morgan from "morgan";
import cors from "cors";
import logger from "./logger.js";
import { configDotenv } from "dotenv";
import http from "http";
import bodyParser from "body-parser";
import methodOverride from "method-override";
import session from "express-session";

import databaseServer from "./database/index.js";
import customPassport from "./config/passport.js";
import routes from "./routes/index.js";

configDotenv();

class ServerBackend {
  constructor() {
    this.app = express();
    this.initializeMiddleware();
    customPassport.setupPassport();
    this.initializeRoutes();
    this.server = http.createServer(this.app);
  }

  initializeMiddleware() {
    this.app.use(cors({ optionsSuccessStatus: 200 }));
    this.configureLogger();

    this.app.use(bodyParser.urlencoded({ extended: false }));
    this.app.use(bodyParser.json());

    this.app.use(methodOverride());

    this.app.use(session({ secret: "conduit", cookie: { maxAge: 60000 }, resave: false, saveUninitialized: false }));
  }

  configureLogger() {
    const morganOption = {
      stream: {
        write: (message) => logger.info(message.trim()),
      },
    };

    this.app.use(morgan("combined", morganOption));
  }

  initializeRoutes() {
    this.app.use(routes);
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
