// src/socketio/index.js
import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import "dotenv/config";

import logger from "../logger.js";
import serverRooms from "./rooms.js";
import serverDMs from "./dms.js";
import serverWatchers from "./watchers.js";
import UserModel from "../models/User.js";

class SocketBackend {
	constructor() {
		this.io = null;
	}

	/**
	 * Start the Socket.IO server on the given port (defaults to 6002).
	 */
	start(port = 6002) {
		this.io = new Server({
			path: "/socket.io",
			cors: { origin: "*" },
		});

		// attach authentication middleware
		this.io.use(this._authenticate.bind(this));

		// handle new connections
		this.io.on("connection", this._onConnection.bind(this));

		this.io.listen(port);
		logger.info(`Socket.IO listening on port ${port}`);
	}

	/**
	 * Middleware: verify JWT and attach decoded user to socket.user
	 */
	_authenticate(socket, next) {
		const auth = socket.handshake.headers.authorization;
		if (!auth) return next(new Error("Authentication error"));
		const token = auth.split(" ")[1];
		jwt.verify(token, process.env.SECRET, (err, decoded) => {
			if (err) return next(new Error("Authentication error"));
			socket.user = decoded;
			next();
		});
	}

	/**
	 * On new client connection: wire up rooms & watchers, send handshake.
	 */
	_onConnection(socket) {
		logger.info(`User connected: '${socket.user.username}'`);
		socket.emit("connected");

                // start handling room events
                serverRooms.startListeners(socket);

                // start handling direct message events
                serverDMs.startListeners(socket);

		// start handling watcher events
		serverWatchers.init(socket);

		// clean up on disconnect
		socket.on("disconnect", () => {
			logger.info(`User disconnected: '${socket.user.username}'`);
			serverRooms.listenerCleanup(socket);
			socket.removeAllListeners();
		});
	}

	/**
	 * Fetch all sockets in a room, plus their profile data.
	 * Returns [ Array<profile>, Array<Socket> ].
	 */
	async getSocketsInRoom(roomId) {
		const sockets = await this.io.in(roomId).fetchSockets();
		const profiles = await Promise.all(sockets.map((s) => UserModel.findById(s.user.id).then((u) => u.toProfilePubJSON(null))));
		return [profiles, sockets];
	}

	/**
	 * Emit a custom event to a single socket by its socket.id.
	 */
	emitToSocketById(socketId, event, payload) {
		const sock = this.io.sockets.sockets.get(socketId);
		if (sock) sock.emit(event, payload);
	}
}

const socketBackend = new SocketBackend();
export default socketBackend;
