// src/socket/rooms.js
import logger from "../logger.js";
import MessageModel from "../models/Message.js";
import RoomModel from "../models/Room.js";
import UserModel from "../models/User.js";
import socketio from "./index.js";
import "dotenv/config";

class ServerRooms {
  /**
   * Fetch all rooms from the database and build two maps:
   *  - idToName:   roomId → room.name
   *  - idToRoom:   roomId → full Room document
   */
  async getRoomList() {
    const idToName = {};
    const idToRoom = {};
    const rooms = await RoomModel.find({});
    for (const room of rooms) {
      idToName[room._id] = room.name;
      idToRoom[room._id] = room;
    }
    return [idToName, idToRoom];
  }

  /**
   * Clean up all room listeners for a given socket (leave all chat rooms).
   */
  async listenerCleanup(socket) {
    await this.leaveRooms(socket);
  }

  /**
   * Helper to notify everyone in a room that `socket.user` has joined.
   */
  async joinRoom(socket, roomId, roomDoc) {
    socket.join(roomId);
    socket.emit("joined_room", roomId, roomDoc.messages);

    try {
      const user = await UserModel.findById(socket.user.id);
      const userProfile = await user.toProfilePubJSON(null);
      const [usersInRoom, socketsInRoom] =
        await socketio.getSocketsInRoom(roomId);

      socketsInRoom.forEach((s) => {
        s.emit("user_list", roomId, usersInRoom, userProfile, "join");
      });
      logger.info(`User '${socket.user.username}' joined room '${roomId}'.`);
    } catch (err) {
      logger.error("Error notifying join:", err);
    }
  }

  /**
   * Leave _all_ previously joined chat rooms (but skip the socket.id room).
   */
  async leaveRooms(socket) {
    try {
      const [idToName] = await this.getRoomList();
      const validRoomIds = new Set(Object.keys(idToName));

      const user = await UserModel.findById(socket.user.id);
      const userProfile = await user.toProfilePubJSON(null);

      for (const roomId of socket.rooms) {
        // skip default socket room and any non-chat-room
        if (!validRoomIds.has(roomId)) continue;

        socket.leave(roomId);
        socket.emit("left_room", roomId);
        logger.info(`User '${socket.user.username}' left room '${roomId}'.`);

        const [usersInRoom, socketsInRoom] =
          await socketio.getSocketsInRoom(roomId);
        socketsInRoom.forEach((s) => {
          s.emit("user_list", roomId, usersInRoom, userProfile, "leave");
        });
      }
    } catch (err) {
      logger.error("Error while leaving rooms:", err);
    }
  }

  startListeners(socket) {
    // Client asks for the list of rooms
    socket.on("list_rooms", async () => {
      try {
        let [idToName, idToRoom] = await this.getRoomList();

        // If no rooms exist yet, create two defaults
        if (Object.keys(idToName).length === 0) {
          const r1 = new RoomModel({
            name: "All Chat 1",
            description: "Public chat for everyone.",
          });
          const r2 = new RoomModel({
            name: "All Chat 2",
            description: "Public chat for everyone.",
          });
          await r1.save();
          await r2.save();
          [idToName, idToRoom] = await this.getRoomList();
        }

        socket.emit("room_list", [idToName, idToRoom]);
      } catch (err) {
        logger.error("Error listing rooms:", err);
      }
    });

    // Client creates a new room
    socket.on("make_room", async (name, description) => {
      try {
        const room = new RoomModel({ name, description });
        await room.save();
        socket.emit("room_created", room._id);
        logger.info(
          `New room '${room.name}' created by '${socket.user.username}'.`,
        );
      } catch (err) {
        logger.error("Error creating room:", err);
      }
    });

    // Client wants to join a given room
    socket.on("join_room", async (roomId) => {
      try {
        const [idToName] = await this.getRoomList();
        if (!idToName[roomId]) {
          throw new Error("Room not found by ID.");
        }

        const roomDoc = await RoomModel.findById(roomId).populate({
          path: "messages",
          populate: { path: "sender", select: "displayName avatarUrl" },
        });

        // Leave any rooms we were in, then join the new one
        await this.leaveRooms(socket);
        await this.joinRoom(socket, roomId, roomDoc);
      } catch (err) {
        logger.error("Error joining room:", err);
      }
    });

    // Client explicitly leaves a room
    socket.on("leave_room", async (roomId) => {
      try {
        // If they specify a roomId, leave only that room; otherwise leave all
        if (roomId) {
          socket.leave(roomId);
          logger.info(`User '${socket.user.username}' left room '${roomId}'.`);
          // Optional: notify others in that room
          const user = await UserModel.findById(socket.user.id);
          const userProfile = await user.toProfilePubJSON(null);
          const [usersInRoom, socketsInRoom] =
            await socketio.getSocketsInRoom(roomId);
          socketsInRoom.forEach((s) => {
            s.emit("user_list", roomId, usersInRoom, userProfile, "leave");
          });
        } else {
          await this.leaveRooms(socket);
        }
      } catch (err) {
        logger.error("Error on leave_room:", err);
      }
    });

    // Client sends a message to a room
    socket.on("message_room", async (arg1, arg2) => {
      try {
        const [idToName] = await this.getRoomList();
        let roomId, content;

        // Support both ( [roomId, content] ) or ( roomId, content ) signatures
        if (Array.isArray(arg1) && arg2 === undefined) {
          [roomId, content] = arg1;
        } else {
          roomId = arg1;
          content = arg2;
        }

        if (!idToName[roomId]) {
          throw new Error("Room not found by ID.");
        }

        // Persist the message
        const sender = await UserModel.findById(socket.user.id);
        if (!sender) throw new Error("Sender not found.");

        const msg = new MessageModel({ sender, content });
        await msg.save();

        const roomDoc = await RoomModel.findById(roomId);
        roomDoc.messages.push(msg);
        await roomDoc.save();

        await roomDoc.populate({
          path: "messages",
          populate: { path: "sender", select: "displayName avatarUrl" },
        });

        // Broadcast to everyone in the room
        const [usersInRoom, socketsInRoom] =
          await socketio.getSocketsInRoom(roomId);
        socketsInRoom.forEach((s) => {
          if (s.user.id === socket.user.id) {
            s.emit("message_sent", roomId, roomDoc.messages);
          } else {
            s.emit("new_message", roomId, roomDoc.messages);
          }
        });

        logger.info(
          `User '${socket.user.username}' sent message '${msg._id}' to room '${roomId}'.`,
        );
      } catch (err) {
        logger.error("Error handling message_room:", err);
      }
    });

    // Client edits an existing message
    socket.on("edit_message", async (roomId, messageId, content) => {
      try {
        const [idToName] = await this.getRoomList();
        if (!idToName[roomId]) {
          throw new Error("Room not found by ID.");
        }

        const msg = await MessageModel.findById(messageId);
        if (!msg) return;
        if (msg.sender.toString() !== socket.user.id) return;

        msg.content = content;
        await msg.save();

        const roomDoc = await RoomModel.findById(roomId).populate({
          path: "messages",
          populate: { path: "sender", select: "displayName avatarUrl" },
        });

        const [, socketsInRoom] = await socketio.getSocketsInRoom(roomId);
        socketsInRoom.forEach((s) => {
          s.emit("messages_updated", roomId, roomDoc.messages);
        });
      } catch (err) {
        logger.error("Error handling edit_message:", err);
      }
    });

    // Client deletes a message
    socket.on("delete_message", async (roomId, messageId) => {
      try {
        const [idToName] = await this.getRoomList();
        if (!idToName[roomId]) {
          throw new Error("Room not found by ID.");
        }

        const msg = await MessageModel.findById(messageId);
        if (!msg) return;
        if (msg.sender.toString() !== socket.user.id) return;

        await MessageModel.deleteOne({ _id: messageId });
        await RoomModel.findByIdAndUpdate(roomId, {
          $pull: { messages: messageId },
        });

        const roomDoc = await RoomModel.findById(roomId).populate({
          path: "messages",
          populate: { path: "sender", select: "displayName avatarUrl" },
        });

        const [, socketsInRoom] = await socketio.getSocketsInRoom(roomId);
        socketsInRoom.forEach((s) => {
          s.emit("messages_updated", roomId, roomDoc.messages);
        });
      } catch (err) {
        logger.error("Error handling delete_message:", err);
      }
    });
  }
}

const serverRooms = new ServerRooms();
export default serverRooms;
