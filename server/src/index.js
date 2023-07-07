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
const authImport = require("./routes/auth.js");
const authRoutes = authImport.router;
const User = authImport.User;
const logger = require("./logging/logger.js");

const dotenv = require("dotenv");
dotenv.config();

const MongoServer = require("./mongoose/mongoServer.js");
let mongoServer = MongoServer.startServer();

const verifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  message: "Too many verification attempts from this IP, please try again after an hour",
});

const app = express();
const server = http.createServer(app);
const { Server } = require("socket.io");
const { initiateSocketIO } = require("./socketio/socketio.js");
const io = new Server(server, {
  path: "/socket.io",
  cors: {
    origin: "http://localhost:3000",
  },
});

initiateSocketIO(io);

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
  const decoded = jwt.verify(req.headers.authorization, process.env.SECRET);
  const user = await User.findById(decoded["_id"]);
  res.send({ user });
});

app.use("/api/auth", authRoutes);

server.listen(process.env.PORT, () => logger.info(`Server started on port ${process.env.PORT}`));

process.on("SIGINT", async () => {
  MongoServer.stopServer();
  process.exit();
});

mongoose.set("strictQuery", false);
