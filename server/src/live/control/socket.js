/**
 * Socket.IO namespace `/live-control` — the wire that carries viewer
 * capabilities up to the server and recommendations + acknowledgements
 * back down to the streamer.
 *
 * Viewers authenticate exactly the same way the rest of the site does
 * (signed JWT in the `token` cookie). Streamers authenticate with the
 * per-session ingest secret already issued by `LiveService.createSession`.
 *
 * The module is deliberately thin: it owns the connection lifecycle and
 * defers all aggregation/recommendation logic to `controlSession.js`.
 *
 * @typedef {import("socket.io").Server} Server
 * @typedef {import("../service.js").LiveService} LiveService
 */

import crypto from "node:crypto";

import logger from "../../logger.js";
import StreamSessionModel from "../../models/StreamSession.js";
import { parseCookieHeader, validateAccessToken } from "../../utils/auth.js";
import { isProtocolCompatible, MSG, PROTOCOL_VERSION, ROLE, SOCKET_NAMESPACE } from "../../../../shared/streaming/protocol.js";
import { createControlRegistry } from "./controlSession.js";

// Every envelope we emit to a client must advertise the protocol version
// it speaks; both the streamer-side and viewer-side clients hard-drop
// any message whose `protocolVersion` does not equal `PROTOCOL_VERSION`.
// We stamp the version centrally here so individual call sites cannot
// forget it.
const stamp = (envelope) => ({ protocolVersion: PROTOCOL_VERSION, ...envelope });

const VIEWER_ROOM = (sessionId) => `live-control:${sessionId}:viewers`;
const STREAMER_ROOM = (sessionId) => `live-control:${sessionId}:streamer`;

const hashSecret = (value) => crypto.createHash("sha256").update(String(value)).digest("hex");

const constantTimeEquals = (left, right) => {
	if (typeof left !== "string" || typeof right !== "string") return false;
	if (left.length !== right.length) return false;
	return crypto.timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
};

const extractViewerToken = (handshake) => {
	const headers = handshake?.headers || {};
	const cookies = parseCookieHeader(headers.cookie);
	if (cookies.token) return cookies.token;
	const auth = headers.authorization || headers.Authorization;
	if (auth && typeof auth === "string") {
		const [scheme, token] = auth.split(" ");
		if (scheme && token && (scheme === "Bearer" || scheme === "Token")) return token;
	}
	const queryToken = handshake?.auth?.token || handshake?.query?.token;
	if (queryToken) return queryToken;
	return null;
};

const extractIngestSecret = (handshake) => {
	const headers = handshake?.headers || {};
	const headerSecret = headers["x-live-ingest-secret"];
	if (headerSecret) return Array.isArray(headerSecret) ? headerSecret[0] : headerSecret;
	const auth = handshake?.auth || {};
	if (auth.ingestSecret) return auth.ingestSecret;
	const query = handshake?.query || {};
	if (query.ingestSecret) return query.ingestSecret;
	return null;
};

const parseRole = (handshake) => {
	const role = handshake?.auth?.role || handshake?.query?.role || ROLE.VIEWER;
	return role === ROLE.STREAMER ? ROLE.STREAMER : ROLE.VIEWER;
};

const parseSessionId = (handshake) => {
	const candidate = handshake?.auth?.sessionId || handshake?.query?.sessionId || null;
	if (!candidate || typeof candidate !== "string") return null;
	return candidate;
};

const authenticateViewer = async (handshake) => {
	const token = extractViewerToken(handshake);
	if (!token) {
		const err = new Error("Live control viewer requires login.");
		err.data = { code: "viewer_auth_missing" };
		throw err;
	}
	try {
		const { user } = await validateAccessToken(token);
		return { id: user._id.toString(), username: user.username };
	} catch (_err) {
		const err = new Error("Live control viewer token is invalid.");
		err.data = { code: "viewer_auth_invalid" };
		throw err;
	}
};

const authenticateStreamer = async (sessionId, handshake) => {
	const ingestSecret = extractIngestSecret(handshake);
	if (!ingestSecret) {
		const err = new Error("Live control streamer requires ingest secret.");
		err.data = { code: "streamer_secret_missing" };
		throw err;
	}
	const session = await StreamSessionModel.findOne({ sessionId });
	if (!session || session.status !== "active") {
		const err = new Error("Live control session is not active.");
		err.data = { code: "session_inactive" };
		throw err;
	}
	if (!constantTimeEquals(session.ingestSecretHash, hashSecret(ingestSecret))) {
		const err = new Error("Live control ingest secret is invalid.");
		err.data = { code: "streamer_secret_invalid" };
		throw err;
	}
	return { sessionId };
};

const createLiveControlNamespace = ({ io, registry = createControlRegistry({ log: logger }) } = {}) => {
	if (!io) throw new Error("createLiveControlNamespace requires a Socket.IO server instance.");
	const namespace = io.of(SOCKET_NAMESPACE);

	const buildEmitter =
		(controlSession) =>
		({ scope, envelope }) => {
			if (!envelope) return;
			const stamped = stamp(envelope);
			if (scope === "viewers") {
				namespace.to(VIEWER_ROOM(controlSession.sessionId)).emit("control", stamped);
				return;
			}
			if (scope === "streamer") {
				const streamerSocketId = controlSession.getStreamerSocketId();
				if (!streamerSocketId) return;
				namespace.to(streamerSocketId).emit("control", stamped);
			}
		};

	namespace.use(async (socket, next) => {
		try {
			const role = parseRole(socket.handshake);
			const sessionId = parseSessionId(socket.handshake);
			if (!sessionId) {
				const err = new Error("Live control requires sessionId.");
				err.data = { code: "session_missing" };
				return next(err);
			}

			if (role === ROLE.STREAMER) {
				await authenticateStreamer(sessionId, socket.handshake);
			} else {
				socket.user = await authenticateViewer(socket.handshake);
			}

			socket.controlSessionId = sessionId;
			socket.controlRole = role;
			return next();
		} catch (err) {
			logger.warn(`[live-control] handshake rejected: ${err.message}`);
			return next(err);
		}
	});

	namespace.on("connection", (socket) => {
		const sessionId = socket.controlSessionId;
		const role = socket.controlRole;
		const controlSession = registry.ensureSession(sessionId, (event) => buildEmitter(controlSession)(event));

		const send = (envelope) => socket.emit("control", stamp(envelope));

		if (role === ROLE.VIEWER) {
			socket.join(VIEWER_ROOM(sessionId));
			send({
				type: MSG.HELLO,
				role: ROLE.VIEWER,
				sessionId,
				summary: controlSession.recomputeAndPush ? null : null,
			});
			logger.info(`[live-control] viewer ${socket.user?.username || "?"} joined sessionId=${sessionId} socketId=${socket.id}`);
		} else {
			socket.join(STREAMER_ROOM(sessionId));
			logger.info(`[live-control] streamer joined sessionId=${sessionId} socketId=${socket.id}`);
		}

		socket.on("control", (envelope) => {
			if (!isProtocolCompatible(envelope)) {
				logger.warn(`[live-control] dropping incompatible message from ${socket.id} type=${envelope?.type ?? "?"}`);
				return;
			}

			if (envelope.type === MSG.VIEWER_CAPABILITIES) {
				if (role !== ROLE.VIEWER) return;
				if (envelope.sessionId && envelope.sessionId !== sessionId) return;
				controlSession.upsertViewer(socket.id, {
					viewerId: envelope.viewerId,
					codecs: envelope.codecs || {},
					supportedCodecFamilies: envelope.supportedCodecFamilies || [],
					network: envelope.network || {},
					display: envelope.display || {},
					userAgent: envelope.userAgent || "",
					probedAt: envelope.probedAt || Date.now(),
				});
				return;
			}

			if (envelope.type === MSG.STREAMER_HELLO) {
				if (role !== ROLE.STREAMER) return;
				const result = controlSession.attachStreamer(socket.id, {
					initialCeiling: envelope.ceiling || null,
					currentSettings: envelope.currentSettings || null,
					autoAdapt: envelope.autoAdapt !== false,
				});
				send({
					type: MSG.HELLO,
					role: ROLE.STREAMER,
					sessionId,
					summary: result.summary,
					recommendation: result.recommendation,
					autoAdapt: result.autoAdapt,
				});
				return;
			}

			if (envelope.type === MSG.ACK) {
				if (role !== ROLE.STREAMER) return;
				controlSession.ackRecommendation(socket.id, {
					applied: Boolean(envelope.applied),
					actualSettings: envelope.actualSettings || null,
					clampedBy: envelope.clampedBy || null,
					reason: envelope.reason || "",
					ackId: envelope.ackId || null,
				});
				return;
			}

			if (envelope.type === MSG.ADAPTATION_TOGGLED) {
				if (role !== ROLE.STREAMER) return;
				controlSession.setAutoAdapt(socket.id, envelope.autoAdapt);
				return;
			}

			if (envelope.type === MSG.STREAMER_GOODBYE) {
				if (role !== ROLE.STREAMER) return;
				controlSession.detachStreamer(socket.id, { reason: envelope.reason || "explicit_goodbye" });
				return;
			}
		});

		socket.on("disconnect", (reason) => {
			if (role === ROLE.VIEWER) {
				controlSession.removeViewer(socket.id);
				logger.info(`[live-control] viewer left sessionId=${sessionId} reason=${reason}`);
			} else {
				controlSession.detachStreamer(socket.id, { reason });
				logger.info(`[live-control] streamer left sessionId=${sessionId} reason=${reason}`);
			}
			registry.cleanupIfEmpty(sessionId);
		});
	});

	return { namespace, registry };
};

export { createLiveControlNamespace, VIEWER_ROOM, STREAMER_ROOM };
