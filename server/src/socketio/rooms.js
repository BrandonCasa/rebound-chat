import { Server } from "socket.io";
import logger from "../logger.js";
import "dotenv/config";

class ServerRooms {
  constructor() {
    this.roomList = {
      0: "General",
    };
  }

  startListeners(sockets) {
    sockets.forEach((socket) => {
      this.attachListeners(socket);
    });
  }

  stopAllListeners(sockets) {
    sockets.forEach((socket) => {
      socket.removeAllListeners();
    });
  }

  attachListeners(socket) {
    socket.on("join_room", (roomId) => {
      try {
        socket.join(this.roomList[roomId] || "General");
      } catch (error) {
        logger.error(error);
      }
    });

    socket.on("leave_room", (roomId) => {
      try {
        socket.leave(this.roomList[roomId]);
      } catch (error) {
        logger.error(error);
      }
    });

    socket.on("message_room", (roomId, msg) => {
      socket.to(this.roomList[roomId] || "General").emit();
    });
  }
}

const serverRooms = new ServerRooms();

export { serverRooms as default };
