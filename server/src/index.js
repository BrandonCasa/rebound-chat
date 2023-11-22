import express from "express";
import helmet from "helmet";
import mongoose from "mongoose";
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
    this.server = http.createServer(this.app);
    this.app.use(cors());
    this.app.use(express.json());
    this.app.use(helmet());

    logger.stream = {
      write: function (message) {
        logger.info(message);
      },
    };

    this.app.use(morgan("combined", { stream: logger.stream }));
  }

  async startBackend() {
    await databaseServer.startServer();
    this.server.listen(process.env.PORT, () => logger.info(`Server started on port ${process.env.PORT}`));
  }

  async stopBackend() {
    await databaseServer.stopServer();
    this.server.close();
  }
}

const serverBackend = new ServerBackend();

process.on("SIGINT", async () => {
  await serverBackend.stopBackend();
  process.exit();
});

serverBackend.startBackend();
