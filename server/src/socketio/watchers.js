import logger from "../logger.js";
import UserModel from "../models/User.js";
import socketBackend from "./index.js";

class ServerWatchers {
	#watched = new Map();

	init(socket) {
		socket.on("watch_user", (id) => this.#addWatch(socket, id));
		socket.on("unwatch_user", (id) => this.#removeWatch(socket, id));
		socket.on("disconnect", () => this.#removeAllForSocket(socket));
	}

	async #addWatch(socket, watchedId) {
		try {
			if (!(await UserModel.exists({ _id: watchedId }))) return;
			if (!this.#watched.has(watchedId)) {
				this.#watched.set(watchedId, new Map());
			}
			this.#watched.get(watchedId).set(socket.id, socket.user.id);
		} catch (err) {
			logger.error(err);
		}
	}

	#removeWatch(socket, watchedId) {
		const m = this.#watched.get(watchedId);
		if (!m) return;
		m.delete(socket.id);
		if (m.size === 0) this.#watched.delete(watchedId);
	}

	#removeAllForSocket(socket) {
		for (const [watchedId, m] of this.#watched) {
			m.delete(socket.id);
			if (m.size === 0) this.#watched.delete(watchedId);
		}
	}

	async onUserSaved(userId) {
		const watchers = this.#watched.get(userId);
		if (!watchers) return;

		let changedUser;
		try {
			changedUser = await UserModel.findById(userId);
			if (!changedUser) return;
		} catch (err) {
			logger.error("Error loading changed user:", err);
			return;
		}

		for (const [socketId, watcherUserId] of watchers) {
			try {
				const watcherUser = await UserModel.findById(watcherUserId);
				const publicInfo = await changedUser.toProfilePubJSON(watcherUser);
				const privateInfo = await changedUser.toProfilePrivJSON(watcherUser);
				socketBackend.emitToSocketById(socketId, "watched_user_saved", [userId, publicInfo, privateInfo]);
			} catch (err) {
				logger.error(`Error notifying watcher ${watcherUserId}:`, err);
			}
		}
	}
}

export default new ServerWatchers();
