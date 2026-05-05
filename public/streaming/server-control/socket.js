/**
 * Streamer-side client for the `/live-control` namespace.
 *
 * This runs in the Electron main process. It opens a Socket.IO
 * connection to the Rebound server keyed by sessionId + ingestSecret,
 * announces the streamer's `ceiling` + `currentSettings`, and then
 * waits for the server to push `viewer-summary` and
 * `recommended-settings` messages.
 *
 * The client is intentionally dumb about what to *do* with a
 * recommendation — it just emits an event and lets the manager decide
 * (apply via adapter + respawn? ignore because auto-adapt is off?).
 *
 * Connection lifecycle is bound to the streaming session: the manager
 * calls `start()` after the FFmpeg pipeline boots and `stop()` when
 * the session ends.
 */

import { EventEmitter } from "node:events";
import { io as ioClient } from "socket.io-client";

import {
	MSG,
	PROTOCOL_VERSION,
	ROLE,
	SOCKET_NAMESPACE,
	buildAck,
	buildAdaptationToggled,
	buildStreamerGoodbye,
	buildStreamerHello,
	isProtocolCompatible,
} from "../../../shared/streaming/protocol.js";

const RECONNECT_DELAY_MS = 1500;
const RECONNECT_MAX_DELAY_MS = 15_000;

const deriveSocketBaseUrl = (websiteBaseUrl) => {
	if (!websiteBaseUrl) return "";
	try {
		const url = new URL(websiteBaseUrl);
		const host = url.host;
		const protocol = url.protocol === "https:" ? "https:" : "http:";
		const portFromUrl = url.port ? Number(url.port) : protocol === "https:" ? 443 : 80;
		const websocketPort = portFromUrl + 1;
		const portSegment = url.port ? `:${websocketPort}` : "";
		const hostname = host.split(":")[0];
		return `${protocol}//${hostname}${portSegment}`;
	} catch (_err) {
		return websiteBaseUrl;
	}
};

const createServerControlClient = ({ logger } = {}) => {
	const events = new EventEmitter();
	let socket = null;
	let lastHelloPayload = null;
	let started = false;

	const log = (level, message) => {
		if (!logger || typeof logger[level] !== "function") return;
		logger[level](`[server-control] ${message}`);
	};

	const sendHello = () => {
		if (!socket || !socket.connected || !lastHelloPayload) return;
		socket.emit("control", buildStreamerHello(lastHelloPayload));
	};

	const handleControlMessage = (envelope) => {
		if (!isProtocolCompatible(envelope)) {
			log("warn", `dropping incompatible message type=${envelope?.type ?? "?"} version=${envelope?.protocolVersion ?? "?"}`);
			return;
		}

		switch (envelope.type) {
			case MSG.HELLO:
				events.emit("hello", envelope);
				return;
			case MSG.VIEWER_SUMMARY:
				events.emit("viewer-summary", envelope);
				return;
			case MSG.RECOMMENDED_SETTINGS:
				events.emit("recommended-settings", envelope);
				return;
			default:
				log("warn", `unhandled message type ${envelope.type}`);
		}
	};

	const start = ({ websiteBaseUrl, sessionId, ingestSecret, ceiling, currentSettings, autoAdapt }) => {
		if (started) return;
		if (!sessionId || !ingestSecret) {
			log("warn", "start aborted: missing sessionId or ingestSecret");
			return;
		}
		started = true;
		lastHelloPayload = { sessionId, ceiling, currentSettings, autoAdapt };

		const baseUrl = deriveSocketBaseUrl(websiteBaseUrl);
		log("info", `connecting baseUrl=${baseUrl} sessionId=${sessionId} protocolVersion=${PROTOCOL_VERSION}`);

		socket = ioClient(`${baseUrl}${SOCKET_NAMESPACE}`, {
			path: "/socket.io",
			transports: ["websocket"],
			reconnection: true,
			reconnectionDelay: RECONNECT_DELAY_MS,
			reconnectionDelayMax: RECONNECT_MAX_DELAY_MS,
			auth: {
				role: ROLE.STREAMER,
				sessionId,
				ingestSecret,
			},
			extraHeaders: {
				"x-live-ingest-secret": ingestSecret,
			},
		});

		socket.on("connect", () => {
			log("info", "connected");
			sendHello();
			events.emit("connected");
		});

		socket.on("disconnect", (reason) => {
			log("info", `disconnected reason=${reason}`);
			events.emit("disconnected", { reason });
		});

		socket.on("connect_error", (err) => {
			log("warn", `connect_error: ${err?.message || err}`);
			events.emit("connect-error", { message: err?.message || String(err) });
		});

		socket.on("control", handleControlMessage);
	};

	const sendAck = ({ sessionId, applied, actualSettings, clampedBy, reason, ackId }) => {
		if (!socket || !socket.connected) return false;
		socket.emit("control", buildAck({ sessionId, applied, actualSettings, clampedBy, reason, ackId }));
		return true;
	};

	const setAutoAdapt = ({ sessionId, autoAdapt }) => {
		if (lastHelloPayload) lastHelloPayload.autoAdapt = autoAdapt;
		if (!socket || !socket.connected) return false;
		socket.emit("control", buildAdaptationToggled({ sessionId, autoAdapt }));
		return true;
	};

	const updateCeiling = ({ ceiling, currentSettings, autoAdapt }) => {
		if (!lastHelloPayload) return;
		lastHelloPayload = {
			...lastHelloPayload,
			ceiling: ceiling || lastHelloPayload.ceiling,
			currentSettings: currentSettings || lastHelloPayload.currentSettings,
			autoAdapt: typeof autoAdapt === "boolean" ? autoAdapt : lastHelloPayload.autoAdapt,
		};
		sendHello();
	};

	const stop = ({ reason = "stream_ended" } = {}) => {
		if (!started) return;
		started = false;
		const sessionId = lastHelloPayload?.sessionId;
		try {
			if (socket?.connected && sessionId) {
				socket.emit("control", buildStreamerGoodbye({ sessionId, reason }));
			}
		} catch (_err) {
			// best-effort goodbye
		}
		try {
			socket?.close();
		} catch (_err) {
			// already closed
		}
		socket = null;
		lastHelloPayload = null;
	};

	return {
		events,
		start,
		stop,
		sendAck,
		setAutoAdapt,
		updateCeiling,
		isConnected: () => Boolean(socket?.connected),
	};
};

export { createServerControlClient, deriveSocketBaseUrl, RECONNECT_DELAY_MS, RECONNECT_MAX_DELAY_MS };
