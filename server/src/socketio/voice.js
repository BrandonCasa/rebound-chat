import { randomUUID } from "crypto";
import logger from "../logger.js";
import UserModel from "../models/User.js";
import socketBackend from "./index.js";

class ServerVoice {
    #calls = new Map(); // callId -> { callerId, calleeId }

    async #emitToUser(userId, event, ...args) {
        const sockets = await socketBackend.io.fetchSockets();
        sockets.forEach((s) => {
            if (s.user.id === userId) s.emit(event, ...args);
        });
    }

    async #startCall(socket, calleeId) {
        try {
            const callee = await UserModel.findById(calleeId);
            if (!callee) return;
            const callId = randomUUID();
            this.#calls.set(callId, { callerId: socket.user.id, calleeId });
            await this.#emitToUser(calleeId, "incoming_call", callId, socket.user.id);
            socket.emit("call_started", callId);
        } catch (err) {
            logger.error("call_user error:", err);
        }
    }

    async #acceptCall(socket, callId) {
        try {
            const call = this.#calls.get(callId);
            if (!call || call.calleeId !== socket.user.id) return;
            await this.#emitToUser(call.callerId, "call_accepted", callId);
            socket.emit("call_accepted", callId);
        } catch (err) {
            logger.error("accept_call error:", err);
        }
    }

    async #relaySignal(socket, callId, signal) {
        try {
            const call = this.#calls.get(callId);
            if (!call) return;
            const otherId =
                call.callerId === socket.user.id ? call.calleeId : call.callerId;
            await this.#emitToUser(otherId, "voice_signal", callId, signal);
        } catch (err) {
            logger.error("relay_signal error:", err);
        }
    }

    async #endCall(socket, callId) {
        try {
            const call = this.#calls.get(callId);
            if (!call) return;
            if (call.callerId !== socket.user.id && call.calleeId !== socket.user.id) return;
            this.#calls.delete(callId);
            await this.#emitToUser(call.callerId, "call_ended", callId);
            await this.#emitToUser(call.calleeId, "call_ended", callId);
        } catch (err) {
            logger.error("end_call error:", err);
        }
    }

    #cleanupForSocket(socket) {
        for (const [callId, call] of this.#calls) {
            if (call.callerId === socket.user.id || call.calleeId === socket.user.id) {
                this.#calls.delete(callId);
                const otherId = call.callerId === socket.user.id ? call.calleeId : call.callerId;
                this.#emitToUser(otherId, "call_ended", callId);
            }
        }
    }

    startListeners(socket) {
        socket.on("call_user", (otherId) => this.#startCall(socket, otherId));
        socket.on("accept_call", (callId) => this.#acceptCall(socket, callId));
        socket.on("voice_signal", (callId, signal) =>
            this.#relaySignal(socket, callId, signal)
        );
        socket.on("end_call", (callId) => this.#endCall(socket, callId));
        socket.on("disconnect", () => this.#cleanupForSocket(socket));
    }
}

export default new ServerVoice();
