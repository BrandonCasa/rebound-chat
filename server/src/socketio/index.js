// "./socketio/index.js";
import { Server } from "socket.io";
import logger from "../logger.js";
import jwt from "jsonwebtoken";
import "dotenv/config";
import serverRooms from "./rooms.js";
import serverWatchers from "./watchers.js";
import UserModel from "../models/User.js";
import { configDotenv } from "dotenv";

configDotenv();

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
			if (socket.handshake.headers && socket.handshake.headers.authorization) {
				const token = socket.handshake.headers.authorization.split(" ")[1];
				jwt.verify(token, process.env.SECRET, function (err, decoded) {
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
		serverRooms.startListeners(socket);
		serverWatchers.startListeners(socket);
		socket.emit("connected");
	}

	onDisconnect(socket) {
		logger.info(`User disconnected: '${socket.user.username}'.`);
		serverRooms.removeListeners(socket);
		serverWatchers.removeListeners(socket);
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

	emitToSocketById(socketId, eventName, eventData) {
		this.io.sockets.sockets.get(socketId).emit(eventName, eventData);
	}
}

const socketBackend = new SocketBackend();

export { socketBackend as default };
