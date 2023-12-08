import { Server } from "socket.io";
import logger from "../logger.js";
import RoomModel from "models/Room.js";
import "dotenv/config";

class ServerRooms {
  constructor() {
    this.refreshRooms();
  }

  async getRoomList() {
    let roomList = {};

    const rooms = RoomModel.find({}).toArray();
    await rooms.forEach((room) => {
      roomList[room._id] = room.name;
    });
    return roomList;
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

  async attachListeners(socket) {
    socket.on("join_room", (roomId) => {
      try {
        let roomList = this.getRoomList();

        if (roomList[roomId] === undefined) {
          throw Error("Room not found by ID.");
        }

        socket.join(roomList[roomId]);
      } catch (error) {
        logger.error(error);
      }
    });

    socket.on("leave_room", (roomId) => {
      try {
        let roomList = this.getRoomList();

        if (roomList[roomId] === undefined) {
          throw Error("Room not found by ID.");
        }

        socket.leave(roomList[roomId]);
      } catch (error) {
        logger.error(error);
      }
    });

    socket.on("message_room", async (roomId, msg) => {
      try {
        let roomList = this.getRoomList();

        if (roomList[roomId] === undefined) {
          throw Error("Room not found by ID.");
        }

        const roomName = roomList[roomId];
        socket.to(roomName).emit("new_message", { roomId, msg, sender: socket.id });
        // Save message to MongoDB if necessary
      } catch (error) {
        logger.error(error);
      }
    });
  }
}

const serverRooms = new ServerRooms();

export { serverRooms as default };
