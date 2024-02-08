import { Server } from "socket.io";
import logger from "../logger.js";
import jwt from "jsonwebtoken";
import "dotenv/config";
import serverRooms from "./rooms.js";
import UserModel from "../models/User.js";

class SocketBackend {
  constructor() {
    this.io = null;
  }

  startListening() {
    this.io = new Server({
      path: "/socket.io",
      cors: {
        origin: "*",
      },
    });

    this.initializeMiddleware();
    this.initializeIoEvents();

    this.io.listen(6002);
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
  }

  async getSocketsInRoom(roomId) {
    const roomSockets = await this.io.in(roomId).fetchSockets();
    let outUsers = roomSockets.map(async (socket) => {
      const user = await UserModel.findById(socket.user.id);
      return await user.toProfilePubJSON();
    });
    outUsers = await Promise.all(outUsers);

    return [outUsers, roomSockets];
  }
}

const socketBackend = new SocketBackend();

export { socketBackend as default };
