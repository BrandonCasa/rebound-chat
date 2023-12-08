import { Server } from "socket.io";
import logger from "../logger.js";
import jwt from "jsonwebtoken";
import "dotenv/config";
import serverRooms from "./rooms.js";

class SocketBackend {
  constructor() {
    this.io = null;
  }

  startListening() {
    this.io = new Server({
      path: "/socket.io",
      cors: {
        origin: "http://localhost:3000",
      },
    });

    this.initializeMiddleware();
    this.initializeIoEvents();

    this.io.listen(3000);
  }

  stopListening() {
    this.io.close();
  }

  initializeMiddleware() {
    this.io.use(function (socket, next) {
      if (socket.handshake.query && socket.handshake.query.token) {
        jwt.verify(socket.handshake.query.token, process.env.SECRET, function (err, decoded) {
          if (err) return next(new Error("Authentication error"));
          socket.user = decoded;
          next();
        });
      } else {
        next(new Error("Authentication error"));
      }
    });
  }

  initializeIoEvents() {
    this.io.on("connection", (socket) => {
      this.onConnection(socket);

      socket.on("disconnect", () => {
        this.onDisconnect(socket);
      });
    });
  }

  onConnection(socket) {
    logger.info(`User connected: '${socket.user.username}'.`);
    serverRooms.attachListeners(socket);
    socket.emit("connected");
  }

  onDisconnect(socket) {
    logger.info(`User disconnected: '${socket.user.username}'.`);
    socket.removeAllListeners();
    socket.emit("disconnected");
  }
}
// TODO:
// add chat room database stuff
// add chat room socketio logic

const socketBackend = new SocketBackend();

export { socketBackend as default };
