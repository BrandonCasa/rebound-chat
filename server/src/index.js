const express = require("express");
const multer = require("multer");
const helmet = require("helmet");
const morgan = require("morgan");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const cors = require("cors");
const fs = require("fs");
const rateLimit = require("express-rate-limit");
const http = require("http");

const authRoutes = require("./routes/auth.js");
const logger = require("./logging/logger.js");

const dotenv = require("dotenv");
dotenv.config();

const MongoServer = require("./mongoose/mongoServer.js");
let mongoServer = MongoServer.startServer();

const verifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: "Too many verification attempts from this IP, please try again after an hour",
});

const app = express();
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);

io.on("connection", (socket) => {
  // receive a message from the client
  socket.on("message", (room, msg) => {
    logger.info(`Message received from ${room}: ${msg}`);
    socket.emit("message", msg);
  });
});

app.use(cors());

app.use(express.json());

app.use(helmet());

logger.stream = {
  write: function (message) {
    logger.info(message);
  },
};

app.use(morgan("combined", { stream: logger.stream }));

app.get("/api/auth/verify", verifyLimiter, async (req, res) => {
  const valid = jwt.verify(req.headers.authorization, process.env.SECRET);
  res.send(valid);
});

app.use("/api/auth", authRoutes);

server.listen(process.env.PORT, () => logger.info(`Server started on port ${process.env.PORT}`));

process.on("SIGINT", async () => {
  MongoServer.stopServer();
  process.exit();
});

mongoose.set("strictQuery", false);
