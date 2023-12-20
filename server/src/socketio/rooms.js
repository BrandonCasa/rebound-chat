import { Server } from "socket.io";
import logger from "../logger.js";
import RoomModel from "../models/Room.js";
import MessageModel from "../models/Message.js";
import UserModel from "../models/User.js";
import "dotenv/config";

class ServerRooms {
  async getRoomList() {
    let roomIdList = {};
    let roomList = {};

    const rooms = await RoomModel.find({});
    await rooms.forEach((room) => {
      roomIdList[room._id] = room.name;
      roomList[room._id] = room;
    });
    return [roomIdList, roomList];
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
    socket.on("list_rooms", async (roomName, roomDescription) => {
      try {
        let [roomList, rooms] = await this.getRoomList();
        console.log(rooms);

        if (JSON.stringify(roomList) === JSON.stringify({})) {
          let defaultRoom = new RoomModel();
          defaultRoom.name = "All Chat";
          defaultRoom.description = "Public chat for everyone.";
          await defaultRoom.save();
        }

        [roomList, rooms] = await this.getRoomList();

        socket.emit("room_list", rooms);
      } catch (error) {
        logger.error(error);
      }
    });

    socket.on("make_room", async (roomName, roomDescription) => {
      try {
        let newRoom = new RoomModel();
        newRoom.name = roomName;
        newRoom.description = roomDescription;

        await newRoom.save();

        socket.emit("room_created", newRoom._id);

        logger.info(`New Room Created by '${socket.user.username}'.`);
      } catch (error) {
        logger.error(error);
      }
    });

    socket.on("join_room", async (roomId) => {
      try {
        let [roomList, rooms] = await this.getRoomList();

        if (roomList[roomId] === undefined) {
          throw Error("Room not found by ID.");
        }

        const joinedRoom = await RoomModel.findById(roomId);

        socket.join(roomList[roomId]);
        socket.emit("joined_room", roomId, joinedRoom.messages);
        logger.info(`User '${socket.user.username}' joined room '${roomId}'.`);
      } catch (error) {
        logger.error(error);
      }
    });

    socket.on("leave_room", async (roomId) => {
      try {
        let [roomList, rooms] = await this.getRoomList();

        if (roomList[roomId] === undefined) {
          throw Error("Room not found by ID.");
        }

        socket.leave(roomList[roomId]);
        socket.emit("left_room", roomId);
        logger.info(`User '${socket.user.username}' left room '${roomId}'.`);
      } catch (error) {
        logger.error(error);
      }
    });

    socket.on("message_room", async (roomId, msg) => {
      try {
        let [roomList, rooms] = await this.getRoomList();

        if (roomList[roomId] === undefined) {
          throw Error("Room not found by ID.");
        }

        const sender = await UserModel.findById(socket.user.id);
        if (!sender) {
          throw Error("Couldn't find sender user by ID.");
        }
        let newMessage = new MessageModel();
        newMessage.sender = sender;
        newMessage.content = msg;
        await newMessage.save();

        const messageRoom = await RoomModel.findById(roomId);
        if (!messageRoom) {
          throw Error("Room not found by ID.");
        }
        messageRoom.messages.push(newMessage);
        await messageRoom.save();

        socket.to(roomList[roomId]).emit("new_message", { roomId, msgId: newMessage._id });
        socket.emit("message_sent", roomId, newMessage._id);
        logger.info(`User '${socket.user.username}' sent a message with id '${newMessage._id}' to room '${roomId}'.`);
      } catch (error) {
        logger.error(error);
      }
    });
  }
}

const serverRooms = new ServerRooms();

export { serverRooms as default };
