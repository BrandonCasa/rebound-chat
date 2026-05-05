/**
 * Wire protocol for the live-control channel that sits between viewers,
 * the server, and the streamer. This file is the single source of truth
 * for message shapes, the version constant, and the helpers used to
 * build/parse messages on either side of the wire.
 *
 * Three actors participate:
 *
 *  1. Viewer   — runs in a browser tab playing the HLS stream. Connects
 *                to `/live-control` (Socket.IO namespace), authenticated
 *                by the same cookie/JWT used for the rest of the site.
 *                Sends `viewer-capabilities` updates.
 *  2. Server   — aggregates one `ViewerCapabilities` per viewer per
 *                session, computes a `viewer-summary`, and pushes a
 *                `recommended-settings` to the streamer when the
 *                aggregate moves enough to matter.
 *  3. Streamer — the Electron main process holding the FFmpeg pipeline.
 *                Connects with the per-session ingest secret. Receives
 *                summaries + recommendations, replies with `ack`s
 *                describing what was actually applied (after the
 *                lower-only ceiling clamp).
 *
 * Message envelopes:
 *
 *  Every message is `{ type, protocolVersion, ... }`. Receivers MUST
 *  ignore messages whose `type` they do not recognise instead of throwing
 *  so older/newer peers degrade gracefully. A breaking change bumps
 *  `PROTOCOL_VERSION` and the receiver may decline the connection.
 */

const PROTOCOL_VERSION = 1;

const MSG = Object.freeze({
	HELLO: "hello",
	VIEWER_CAPABILITIES: "viewer-capabilities",
	VIEWER_SUMMARY: "viewer-summary",
	VIEWER_SUMMARY_BROADCAST: "viewer-summary-broadcast",
	RECOMMENDED_SETTINGS: "recommended-settings",
	ACK: "ack",
	STREAMER_ACK_BROADCAST: "streamer-ack-broadcast",
	// Fan-out to viewers describing whether the streamer's pipeline is
	// currently in the middle of applying a server-pushed recommendation.
	// Lets viewers explain a coming rebuffer ("host is adjusting their
	// stream for you") instead of presenting a generic spinner.
	STREAMER_ADAPTING_BROADCAST: "streamer-adapting-broadcast",
	ADAPTATION_TOGGLED: "adaptation-toggled",
	STREAMER_HELLO: "streamer-hello",
	STREAMER_GOODBYE: "streamer-goodbye",
});

const ADAPTING_STATE = Object.freeze({
	PENDING: "pending",
	CLEARED: "cleared",
});

const ADAPTING_DIRECTION = Object.freeze({
	UP: "up",
	DOWN: "down",
	SAME: "same",
});

const TRIGGERED_BY = Object.freeze({
	CONNECT: "connect",
	NETWORK_CHANGE: "network_change",
	HLS_BANDWIDTH: "hls_bandwidth",
	HLS_LEVEL_DROP: "hls_level_drop",
	MANUAL: "manual",
});

const ROLE = Object.freeze({
	VIEWER: "viewer",
	STREAMER: "streamer",
});

const SOCKET_NAMESPACE = "/live-control";

const buildEnvelope = (type, payload = {}) => ({
	type,
	protocolVersion: PROTOCOL_VERSION,
	...payload,
});

const isProtocolCompatible = (message) => {
	if (!message || typeof message !== "object") return false;
	const version = Number(message.protocolVersion);
	if (!Number.isFinite(version)) return false;
	return version === PROTOCOL_VERSION;
};

const buildHello = ({ role, sessionId }) =>
	buildEnvelope(MSG.HELLO, {
		role,
		sessionId,
	});

const buildStreamerHello = ({ sessionId, ceiling, currentSettings, autoAdapt }) =>
	buildEnvelope(MSG.STREAMER_HELLO, {
		sessionId,
		ceiling,
		currentSettings,
		autoAdapt: Boolean(autoAdapt),
	});

const buildStreamerGoodbye = ({ sessionId, reason }) =>
	buildEnvelope(MSG.STREAMER_GOODBYE, {
		sessionId,
		reason: reason || "stream_ended",
	});

const buildViewerCapabilities = ({ viewerId, codecs, supportedCodecFamilies, network, display, userAgent, probedAt, triggeredBy }) =>
	buildEnvelope(MSG.VIEWER_CAPABILITIES, {
		viewerId,
		codecs,
		supportedCodecFamilies,
		network,
		display,
		userAgent,
		probedAt,
		triggeredBy: triggeredBy || TRIGGERED_BY.CONNECT,
	});

const buildViewerSummary = ({ sessionId, viewerCount, minDownlinkMbit, medianDownlinkMbit, supportedCodecs, maxResolution, saveDataCount, updatedAt }) =>
	buildEnvelope(MSG.VIEWER_SUMMARY, {
		sessionId,
		viewerCount,
		minDownlinkMbit,
		medianDownlinkMbit,
		supportedCodecs,
		maxResolution,
		saveDataCount,
		updatedAt: updatedAt || Date.now(),
	});

const buildRecommendedSettings = ({ sessionId, videoBitrate, videoCodec, outputWidth, outputHeight, fps, reason, derivedFromViewerCount, updatedAt }) =>
	buildEnvelope(MSG.RECOMMENDED_SETTINGS, {
		sessionId,
		videoBitrate,
		videoCodec,
		outputWidth,
		outputHeight,
		fps,
		reason: reason || "",
		derivedFromViewerCount: derivedFromViewerCount ?? null,
		updatedAt: updatedAt || Date.now(),
	});

const buildAck = ({ sessionId, applied, actualSettings, clampedBy, reason, ackId }) =>
	buildEnvelope(MSG.ACK, {
		sessionId,
		applied: Boolean(applied),
		actualSettings: actualSettings || null,
		clampedBy: clampedBy || null,
		reason: reason || "",
		ackId: ackId || null,
	});

const buildAdaptationToggled = ({ sessionId, autoAdapt }) =>
	buildEnvelope(MSG.ADAPTATION_TOGGLED, {
		sessionId,
		autoAdapt: Boolean(autoAdapt),
	});

/**
 * Fan-out to viewers describing whether the streamer is mid-respawn
 * applying a server-pushed recommendation.
 *
 *   state = "pending" — server just pushed `recommended-settings` to
 *           the streamer; the FFmpeg pipeline is expected to respawn
 *           shortly and viewers will rebuffer at the next
 *           `EXT-X-DISCONTINUITY`. Viewers should explain the upcoming
 *           rebuffer rather than presenting a generic spinner.
 *   state = "cleared" — the streamer acknowledged the recommendation
 *           (or the server's safety timeout fired). Viewers can drop
 *           the "host is adjusting" affordance.
 *
 * `target` carries the recommendation that triggered the adapting
 * window so a richer viewer UI can name what is changing
 * ("host is dropping to 720p"). `direction` is the same up/down/same
 * classification the recommender uses internally.
 */
const buildStreamerAdaptingBroadcast = ({ sessionId, state, target, reason, direction, derivedFromViewerCount, generation, since, updatedAt }) =>
	buildEnvelope(MSG.STREAMER_ADAPTING_BROADCAST, {
		sessionId,
		state,
		target: target || null,
		reason: reason || "",
		direction: direction || ADAPTING_DIRECTION.SAME,
		derivedFromViewerCount: derivedFromViewerCount ?? null,
		generation: generation ?? null,
		since: since ?? null,
		updatedAt: updatedAt || Date.now(),
	});

export {
	PROTOCOL_VERSION,
	MSG,
	TRIGGERED_BY,
	ROLE,
	SOCKET_NAMESPACE,
	ADAPTING_STATE,
	ADAPTING_DIRECTION,
	buildEnvelope,
	isProtocolCompatible,
	buildHello,
	buildStreamerHello,
	buildStreamerGoodbye,
	buildViewerCapabilities,
	buildViewerSummary,
	buildRecommendedSettings,
	buildAck,
	buildAdaptationToggled,
	buildStreamerAdaptingBroadcast,
};
