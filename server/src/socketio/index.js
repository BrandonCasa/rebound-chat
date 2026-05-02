import { Server } from "socket.io";
import "dotenv/config";

import logger from "../logger.js";
import serverRooms from "./rooms.js";
import serverDMs from "./dms.js";
import serverWatchers from "./watchers.js";
import UserModel from "../models/User.js";
import { parseCookieHeader, validateAccessToken } from "../utils/auth.js";

class SocketBackend {
	constructor() {
		this.io = null;
	}

	start(port = 6002) {
		this.io = new Server({
			path: "/socket.io",
			cors: { origin: "*", credentials: true },
		});

		this.io.use(this._authenticate.bind(this));

		this.io.on("connection", this._onConnection.bind(this));

		this.io.listen(port);
		logger.info(`Socket.IO listening on port ${port}`);
	}

	async _authenticate(socket, next) {
		const cookies = parseCookieHeader(socket.handshake.headers?.cookie);
		const token = cookies?.token;
		if (!token) return next(new Error("Authentication error"));

		try {
			const { user } = await validateAccessToken(token);
			socket.user = { id: user._id.toString(), username: user.username, tokenVersion: user.tokenVersion };
			next();
		} catch (err) {
			logger.error("Socket authentication error:", err);
			next(new Error("Authentication error"));
		}
	}

	_onConnection(socket) {
		logger.info(`User connected: '${socket.user.username}'`);
		socket.emit("connected");

		serverRooms.startListeners(socket);

		serverDMs.startListeners(socket);

		serverWatchers.init(socket);

		socket.on("disconnect", () => {
			logger.info(`User disconnected: '${socket.user.username}'`);
			serverRooms.listenerCleanup(socket);
			socket.removeAllListeners();
		});
	}

	async getSocketsInRoom(roomId) {
		const sockets = await this.io.in(roomId).fetchSockets();
		const profiles = await Promise.all(sockets.map((s) => UserModel.findById(s.user.id).then((u) => u.toProfilePubJSON(null))));
		return [profiles, sockets];
	}

	emitToSocketById(socketId, event, payload) {
		const sock = this.io.sockets.sockets.get(socketId);
		if (sock) sock.emit(event, payload);
	}
}

const socketBackend = new SocketBackend();
export default socketBackend;
