import logger from "../logger.js";
import MessageModel from "../models/Message.js";
import RoomModel from "../models/Room.js";
import UserModel from "../models/User.js";
import socketio from "./index.js";
import "dotenv/config";

const MESSAGE_LIMIT = 50;
const attachmentPopulate = { path: "attachments", select: "url contentType size originalName" };

const populateMessage = async (messageDoc) => {
	if (!messageDoc) return null;
	const populated = await messageDoc.populate([{ path: "sender", select: "displayName avatarUrl" }, attachmentPopulate]);
	return populated.toObject();
};

const normalizeAttachmentIds = (attachments) => {
	if (!Array.isArray(attachments)) return undefined;
	const ids = attachments.filter(Boolean).map((attachment) => attachment.mediaId || attachment._id || attachment);
	return ids.length ? ids : undefined;
};

async function fetchRecentMessages(roomDoc, limit = MESSAGE_LIMIT) {
	const messageIds = roomDoc?.messages ?? [];
	if (!messageIds.length) return [];

	const messages = await MessageModel.find({ _id: { $in: messageIds } })
		.sort({ _id: -1 })
		.limit(limit)
		.populate({ path: "sender", select: "displayName avatarUrl" })
		.populate(attachmentPopulate)
		.lean();

	return messages.reverse();
}

class ServerRooms {
	async getRoomList(user) {
		const idToName = {};
		const idToRoom = {};
		const idToNSFW = {};
		const rooms = await RoomModel.find({}).select("-messages");
		for (const room of rooms) {
			if (room?.name?.startsWith("Hidden Chat ")) continue;
			if (room.nsfw && !user?.allowNSFW) continue;
			idToName[room._id] = room.name;
			idToNSFW[room._id] = room.nsfw;
			idToRoom[room._id] = room;
		}
		return [idToName, idToRoom, idToNSFW];
	}

	async listenerCleanup(socket) {
		await this.leaveRooms(socket);
	}

	async joinRoom(socket, roomId, roomDoc) {
		socket.join(roomId);

		try {
			const messages = await fetchRecentMessages(roomDoc);
			socket.emit("joined_room", roomId, messages);
		} catch (err) {
			logger.error("Error loading initial room messages:", err);
		}

		try {
			const user = await UserModel.findById(socket.user.id);
			const userProfile = await user.toProfilePubJSON(null);
			const [usersInRoom, socketsInRoom] = await socketio.getSocketsInRoom(roomId);

			socketsInRoom.forEach((s) => {
				s.emit("user_list", roomId, usersInRoom, userProfile, "join");
			});

			logger.info(`User '${socket.user.username}' joined room '${roomId}'.`);
		} catch (err) {
			logger.error("Error notifying join:", err);
		}
	}

	async leaveRooms(socket) {
		try {
			const user = await UserModel.findById(socket.user.id);
			const [idToName] = await this.getRoomList(user);
			const validRoomIds = new Set(Object.keys(idToName));

			const userProfile = await user.toProfilePubJSON(null);

			for (const roomId of socket.rooms) {
				if (!validRoomIds.has(roomId)) continue;

				socket.leave(roomId);
				socket.emit("left_room", roomId);
				logger.info(`User '${socket.user.username}' left room '${roomId}'.`);

				const [usersInRoom, socketsInRoom] = await socketio.getSocketsInRoom(roomId);
				socketsInRoom.forEach((s) => {
					s.emit("user_list", roomId, usersInRoom, userProfile, "leave");
				});
			}
		} catch (err) {
			logger.error("Error while leaving rooms:", err);
		}
	}

	startListeners(socket) {
		socket.on("list_rooms", async () => {
			try {
				const user = await UserModel.findById(socket.user.id);
				let [idToName, idToRoom, idToNSFW] = await this.getRoomList(user);

				if (Object.keys(idToName).length === 0) {
					const r1 = new RoomModel({
						name: "All Chat",
						description: "Public chat for everyone.",
					});
					const r2 = new RoomModel({
						name: "Hidden Chat 2",
						description: "Hidden chat!",
					});
					await r1.save();
					await r2.save();
					[idToName, idToRoom, idToNSFW] = await this.getRoomList(user);
				}

				socket.emit("room_list", [idToName, idToRoom, idToNSFW]);
			} catch (err) {
				logger.error("Error listing rooms:", err);
			}
		});

		socket.on("make_room", async (name, description) => {
			try {
				const room = new RoomModel({ name, description });
				await room.save();
				socket.emit("room_created", room._id);
				logger.info(`New room '${room.name}' created by '${socket.user.username}'.`);
			} catch (err) {
				logger.error("Error creating room:", err);
			}
		});

		socket.on("join_room", async (roomId) => {
			try {
				const user = await UserModel.findById(socket.user.id);
				const [idToName] = await this.getRoomList(user);
				if (!idToName[roomId]) {
					throw new Error("Room not found by ID.");
				}

				const roomDoc = await RoomModel.findById(roomId).populate({
					path: "messages",
					options: { sort: { createdAt: 1 } },
					populate: { path: "sender", select: "displayName avatarUrl" },
				});

				await this.leaveRooms(socket);
				await this.joinRoom(socket, roomId, roomDoc);
			} catch (err) {
				logger.error("Error joining room:", err);
			}
		});

		socket.on("leave_room", async (roomId) => {
			try {
				if (roomId) {
					socket.leave(roomId);
					logger.info(`User '${socket.user.username}' left room '${roomId}'.`);
					const user = await UserModel.findById(socket.user.id);
					const userProfile = await user.toProfilePubJSON(null);
					const [usersInRoom, socketsInRoom] = await socketio.getSocketsInRoom(roomId);
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

		socket.on("message_room", async (arg1, arg2, arg3, arg4) => {
			try {
				const sender = await UserModel.findById(socket.user.id);
				const [idToName] = await this.getRoomList(sender);
				let roomId, content, mentions, attachments;

				if (Array.isArray(arg1) && arg2 === undefined) {
					[roomId, content, mentions, attachments] = arg1;
				} else {
					roomId = arg1;
					content = arg2;
					mentions = arg3;
					attachments = arg4;
				}

				if (!idToName[roomId]) {
					throw new Error("Room not found by ID.");
				}

				if (!sender) throw new Error("Sender not found.");

				if ((content?.trim?.() ?? "") === "" && attachments?.length < 1) throw new Error("No message content or attachments.");

				const msg = new MessageModel({
					sender,
					content: content,
					mentions,
					room: roomId,
					attachments: normalizeAttachmentIds(attachments),
				});
				await msg.save();

				const roomDoc = await RoomModel.findById(roomId);
				roomDoc.messages.push(msg);
				await roomDoc.save();
				const populatedMsg = await populateMessage(msg);

				const [usersInRoom, socketsInRoom] = await socketio.getSocketsInRoom(roomId);
				socketsInRoom.forEach((s) => {
					if (s.user.id === socket.user.id) {
						s.emit("message_sent", roomId, populatedMsg);
					} else {
						s.emit("new_message", roomId, populatedMsg);
					}
				});

				logger.info(`User '${socket.user.username}' sent message '${msg._id}' to room '${roomId}'.`);
			} catch (err) {
				logger.error("Error handling message_room:", err);
			}
		});

		socket.on("edit_message", async (roomId, messageId, content, mentions) => {
			try {
				const user = await UserModel.findById(socket.user.id);
				const [idToName] = await this.getRoomList(user);
				if (!idToName[roomId]) {
					throw new Error("Room not found by ID.");
				}

				const roomDoc = await RoomModel.findById(roomId).select("messages");
				const msg = await MessageModel.findById(messageId);
				if (!msg) return;
				if (msg.sender.toString() !== socket.user.id) return;
				if (!roomDoc?.messages?.some((m) => m.toString() === messageId)) return;

				msg.content = content;
				msg.mentions = mentions;
				await msg.save();
				const populatedMsg = await populateMessage(msg);

				const [, socketsInRoom] = await socketio.getSocketsInRoom(roomId);
				socketsInRoom.forEach((s) => {
					s.emit("messages_updated", roomId, { type: "edit", message: populatedMsg });
				});
			} catch (err) {
				logger.error("Error handling edit_message:", err);
			}
		});

		socket.on("delete_message", async (roomId, messageId) => {
			try {
				const user = await UserModel.findById(socket.user.id);
				const [idToName] = await this.getRoomList(user);
				if (!idToName[roomId]) {
					throw new Error("Room not found by ID.");
				}

				const msg = await MessageModel.findById(messageId);
				if (!msg) return;
				if (msg.sender.toString() !== socket.user.id) return;

				const roomDoc = await RoomModel.findById(roomId).select("messages");
				if (!roomDoc?.messages?.some((m) => m.toString() === messageId)) return;

				await MessageModel.deleteOne({ _id: messageId });
				await RoomModel.findByIdAndUpdate(roomId, {
					$pull: { messages: messageId },
				});

				const [, socketsInRoom] = await socketio.getSocketsInRoom(roomId);
				socketsInRoom.forEach((s) => {
					s.emit("messages_updated", roomId, { type: "delete", messageId });
				});
			} catch (err) {
				logger.error("Error handling delete_message:", err);
			}
		});
	}
}

const serverRooms = new ServerRooms();
export default serverRooms;
