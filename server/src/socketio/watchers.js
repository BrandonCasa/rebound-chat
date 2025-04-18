import logger           from "../logger.js";
import UserModel        from "../models/User.js";
import socketBackend    from "./index.js";   // must expose emitToSocketById(id,event,payload)

class ServerWatchers {
  /**  Map<watchedUserId, Map<socketId, watcherUserId>> */
  #watched = new Map();

  init(socket) {
    // main listeners
    socket.on("watch_user",  (id) => this.#addWatch(socket, id));
    socket.on("unwatch_user",(id) => this.#removeWatch(socket, id));
    socket.on("disconnect",  ()   => this.#removeAllForSocket(socket));
  }

  /* ------------------------------------------------------------------ */
  async #addWatch(socket, watchedId) {
    try {
      const exists = await UserModel.exists({ _id: watchedId });
      if (!exists) return;

      if (!this.#watched.has(watchedId))
        this.#watched.set(watchedId, new Map());

      this.#watched.get(watchedId).set(socket.id, socket.user.id);
    } catch (err) {
      logger.error(err);
    }
  }

  #removeWatch(socket, watchedId) {
    if (!this.#watched.has(watchedId)) return;
    const m = this.#watched.get(watchedId);
    m.delete(socket.id);
    if (m.size === 0) this.#watched.delete(watchedId);
  }

  #removeAllForSocket(socket) {
    for (const [watchedId, m] of this.#watched) {
      m.delete(socket.id);
      if (m.size === 0) this.#watched.delete(watchedId);
    }
  }

  /* ------------------------------------------------------------------ */
  /**
   * Call this from your user‑save hook.
   * @param {string} userId – the user that changed
   * @param {object} publicDoc – sanitized user document
   */
  onUserSaved(userId, publicDoc, privateInfo) {
    const watchers = this.#watched.get(userId);
    if (!watchers) return;

    for (const [socketId] of watchers) {
      socketBackend.emitToSocketById(socketId, "watched_user_saved", [
        userId,
        publicDoc,
      ]);
    }
  }
}

export default new ServerWatchers();
