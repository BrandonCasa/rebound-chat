import express from "express";
import helmet from "helmet";
import mongoose from "mongoose";
import morgan from "morgan";
import cors from "cors";
import logger from "./logging/logger.js";
import dotenv from "dotenv";
import http from "http";

import * as mongoServer from "./mongoose/mongoServer.js";
// import { initiateSocketIO } from "socketio/socketio.js";

dotenv.config();
mongoServer.startServer();

const app = express();
const server = http.createServer(app);

// initiateSocketIO(server);

app.use(cors());

app.use(express.json());

app.use(helmet());

logger.stream = {
  write: function (message) {
    logger.info(message);
  },
};

app.use(morgan("combined", { stream: logger.stream }));

server.listen(process.env.PORT, () => logger.info(`Server started on port ${process.env.PORT}`));

process.on("SIGINT", async () => {
  mongoServer.stopServer();
  process.exit();
});

mongoose.set("strictQuery", false);
