import { Server } from "socket.io";
import logger from "../logger.js";
import RoomModel from "../models/Room.js";
import MessageModel from "../models/Message.js";
import UserModel from "../models/User.js";
import socketBackend from "./index.js";

import "dotenv/config";

class ServerWatchers {
	constructor() {
		this.watchedUsers = {};
		/*
    this.watchedUsers = {
      "65e1522ad7d3e65642a1cf63": [
        "65e15247d7d3e65642a1cf7d"
      ]
    };
    */
	}

	startListeners(socket) {
		this.attachListeners(socket);
	}

	removeListeners(socket) {
		socket.removeAllListeners();
		if (!socket?.user?.id) return;

		Object.keys(this.watchedUsers).forEach((watchedUserId) => {
			const filtered = this.watchedUsers[watchedUserId].filter((watcher) => watcher[0] === socket.user.id);
			if (filtered.length > 0) {
				const index = this.watchedUsers[watchedUserId].findIndex((watcher) => watcher[0] === socket.user.id);
				if (this.watchedUsers[watchedUserId].length === 1) {
					delete this.watchedUsers[watchedUserId];
				} else {
					this.watchedUsers[watchedUserId].splice(index, 1);
				}
			}
		});
	}

	async attachListeners(socket) {
		if (!socket?.user?.id) return;

		socket.on("watch_user", async (userId) => {
			try {
				const userToWatch = await UserModel.findById(userId);

				if (!userToWatch) {
					return;
				}

				if (!Object.keys(this.watchedUsers).includes(userToWatch._id)) {
					this.watchedUsers[userToWatch._id] = [[socket.user.id, socket.id]];
					return;
				}

				if (this.watchedUsers[userToWatch._id].filter((watcher) => watcher[0] === socket.user.id).length === 0) {
					this.watchedUsers[userToWatch._id].push([socket.user.id, socket.id]);
					return;
				}
			} catch (error) {
				console.log(error);
				logger.error(error);
			}
		});
	}

	onUserSaved(userId, publicDoc, privateDoc) {
		if (Object.keys(this.watchedUsers).includes(userId)) {
			this.watchedUsers[userId].forEach((watcher) => {
				socketBackend.emitToSocketById(watcher[1], "watched_user_saved", [userId, publicDoc]);
			});
		}
	}
}

const serverWatchers = new ServerWatchers();

export { serverWatchers as default };
