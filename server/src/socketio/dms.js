import logger from "../logger.js";
import DmThreadModel from "../models/DmThread.js";
import MessageModel from "../models/Message.js";
import UserModel from "../models/User.js";
import socketio from "./index.js";

class ServerDMs {
  async #getThread(id1, id2) {
    let thread = await DmThreadModel.findOne({
      participants: { $all: [id1, id2], $size: 2 },
    }).populate({
      path: "messages",
      options: { sort: { createdAt: 1 } },
      populate: { path: "sender", select: "displayName avatarUrl" },
    });
    if (!thread) {
      thread = new DmThreadModel({ participants: [id1, id2], messages: [] });
      await thread.save();
    }
    return thread;
  }

  async joinThread(socket, otherId) {
    const thread = await this.#getThread(socket.user.id, otherId);
    socket.join(thread._id.toString());
    socket.emit("dm_joined", thread._id.toString(), thread.messages);
  }

  startListeners(socket) {
    socket.on("join_dm", async (otherId) => {
      try {
        const other = await UserModel.findById(otherId);
        if (!other) return;
        await this.joinThread(socket, otherId);
      } catch (err) {
        logger.error("join_dm error:", err);
      }
    });

    socket.on("message_dm", async (threadId, content) => {
      try {
        const thread = await DmThreadModel.findById(threadId);
        if (!thread) return;
        if (!thread.participants.some((p) => p.toString() === socket.user.id)) return;
        const msg = new MessageModel({ sender: socket.user.id, content });
        await msg.save();
        thread.messages.push(msg);
        await thread.save();
        await thread.populate({
          path: "messages",
          options: { sort: { createdAt: 1 } },
          populate: { path: "sender", select: "displayName avatarUrl" },
        });
        const sockets = await socketio.io.in(threadId).fetchSockets();
        sockets.forEach((s) => {
          if (s.id === socket.id) {
            s.emit("dm_sent", threadId, thread.messages);
          } else {
            s.emit("dm_new_message", threadId, thread.messages);
          }
        });
      } catch (err) {
        logger.error("message_dm error:", err);
      }
    });
  }
}

export default new ServerDMs();
