import { Server } from "socket.io";
import logger from "../logger.js";
import RoomModel from "../models/Room.js";
import MessageModel from "../models/Message.js";
import UserModel from "../models/User.js";
import socketio from "./index.js";
import "dotenv/config";

class ServerRooms {
	async getRoomList() {
		let roomIdList = {};
		let roomList = {};

		const rooms = await RoomModel.find({});
		for (const room of rooms) {
			roomIdList[room._id] = room.name;
			roomList[room._id] = room;
		}
		return [roomIdList, roomList];
	}

	startListeners(socket) {
		this.attachListeners(socket);
	}

	listenerCleanup(socket) {
		this.leaveRooms(socket);
	}

	async leaveRooms(socket) {
		let promises = Promise.all(
			Array.from(socket.rooms).map(async (room) => {
				socket.leave(room);
				socket.emit("left_room", room);
				logger.info(`User '${socket.user.username}' left room '${room}'.`);

				const [usersInRoom, socketsInRoom] = await socketio.getSocketsInRoom(room);
				socketsInRoom.forEach((socket) => {
					socket.emit("user_list", room, usersInRoom);
				});
			})
		);
		await promises;
	}

	async joinRoom(socket, newRoom, joinedRoom) {
		socket.join(newRoom);
		socket.emit("joined_room", newRoom, joinedRoom.messages);

		const [usersInRoom, socketsInRoom] = await socketio.getSocketsInRoom(newRoom);
		socketsInRoom.forEach((socket) => {
			socket.emit("user_list", newRoom, usersInRoom);
		});

		logger.info(`User '${socket.user.username}' joined room '${newRoom}'.`);
	}

	attachListeners(socket) {
		socket.on("list_rooms", async (roomName, roomDescription) => {
			try {
				let [roomList, rooms] = await this.getRoomList();

				if (Object.keys(roomList).length === 0) {
					let defaultARoom = new RoomModel({
						name: "All Chat 1",
						description: "Public chat for everyone.",
					});
					await defaultARoom.save();

					let defaultBRoom = new RoomModel({
						name: "All Chat 2",
						description: "Public chat for everyone.",
					});
					await defaultBRoom.save();
				}

				[roomList, rooms] = await this.getRoomList();

				socket.emit("room_list", [roomList, rooms]);
			} catch (error) {
				console.log(error);
				logger.error(error);
			}
		});

		socket.on("make_room", async (roomName, roomDescription) => {
			try {
				let newRoom = new RoomModel({ name: roomName, description: roomDescription });

				await newRoom.save();

				socket.emit("room_created", newRoom._id);

				logger.info(`New Room Created by '${socket.user.username}'.`);
			} catch (error) {
				console.log(error);
				logger.error(error);
			}
		});

		socket.on("join_room", async (roomId) => {
			try {
				let [roomList, rooms] = await this.getRoomList();

				if (roomList[roomId] === undefined) {
					throw Error("Room not found by ID.");
				}

				const joinedRoom = await RoomModel.findById(roomId).populate([
					{
						path: "messages",
						populate: [{ path: "sender", select: "displayName" }],
					},
				]);

				await this.leaveRooms(socket);

				await this.joinRoom(socket, roomId, joinedRoom);
			} catch (error) {
				console.log(error);
				logger.error(error);
			}
		});

		socket.on("leave_room", async (roomId) => {
			try {
				let [roomList, rooms] = await this.getRoomList();

				if (roomList[roomId] === undefined) {
					console.log(socket.user);
					logger.error(`User '${socket.user.username}' attempted to leave room with ID '${roomId}', but it does not exist.`);
					throw Error("Room not found by ID.");
				}

				await this.leaveRooms(socket);
			} catch (error) {
				console.log(error);
				logger.error(error);
			}
		});

		socket.on("message_room", async ([roomId, msg]) => {
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

				await messageRoom.populate([
					{
						path: "messages",
						populate: [{ path: "sender", select: "displayName" }],
					},
				]);

				const [usersInRoom, socketsInRoom] = await socketio.getSocketsInRoom(roomId);
				socketsInRoom.forEach((newSocket) => {
					if (newSocket.user.id !== socket.user.id) {
						newSocket.emit("new_message", roomId, messageRoom.messages);
					} else {
						socket.emit("message_sent", roomId, messageRoom.messages);
					}
				});

				logger.info(`User '${socket.user.username}' sent a message with id '${newMessage._id}' to room '${roomId}'.`);
			} catch (error) {
				console.log(error);
				logger.error(error);
			}
		});
	}
}

const serverRooms = new ServerRooms();

export { serverRooms as default };
