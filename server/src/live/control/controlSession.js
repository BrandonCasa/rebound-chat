/**
 * One control session per active live stream. Owns the per-session
 * viewer store, the recommender's last-pushed snapshot, the streamer's
 * ceiling, and the emit fan-out.
 *
 * The control session is created when the *first* of either side
 * (viewer or streamer) connects to `/live-control` for that sessionId,
 * and is torn down when the streamer goes away or the last viewer
 * disconnects with no streamer present.
 *
 * The recommender is rate-limited so we never push more often than
 * once every `MIN_RECOMMENDATION_INTERVAL_MS` even if viewers reconnect
 * in a flurry.
 */

import { buildRecommendation, isMeaningfulChange } from "./recommender.js";
import { createViewerStore } from "./viewerStore.js";

const MIN_RECOMMENDATION_INTERVAL_MS = 2_000;

const createControlSession = ({ sessionId, emit, log }) => {
	const viewerStore = createViewerStore();
	let ceiling = null;
	let lastRecommendation = null;
	let lastRecommendationAt = 0;
	let pendingRecomputeTimer = null;
	let streamerSocketId = null;
	let autoAdaptEnabled = true;

	const safeLog = (level, message) => {
		if (!log || typeof log[level] !== "function") return;
		log[level](`[live-control:${sessionId}] ${message}`);
	};

	const fanoutToViewers = (envelope) => {
		emit({ scope: "viewers", sessionId, envelope });
	};

	const sendToStreamer = (envelope) => {
		if (!streamerSocketId) return false;
		emit({ scope: "streamer", sessionId, envelope });
		return true;
	};

	const recomputeAndPush = ({ force = false } = {}) => {
		if (pendingRecomputeTimer) {
			clearTimeout(pendingRecomputeTimer);
			pendingRecomputeTimer = null;
		}

		const summary = viewerStore.getSummary(sessionId);
		fanoutToViewers({ type: "viewer-summary-broadcast", summary });
		sendToStreamer({ type: "viewer-summary", ...summary });

		if (!ceiling) return;
		if (!autoAdaptEnabled && !force) return;

		const recommendation = buildRecommendation({
			sessionId,
			summary,
			viewerSnapshots: viewerStore.listViewerSnapshots(sessionId),
			ceiling,
		});

		if (!recommendation) return;
		if (!force && !isMeaningfulChange(lastRecommendation, recommendation)) return;

		const now = Date.now();
		const nextAt = lastRecommendationAt + MIN_RECOMMENDATION_INTERVAL_MS;
		if (!force && now < nextAt) {
			pendingRecomputeTimer = setTimeout(() => {
				pendingRecomputeTimer = null;
				recomputeAndPush({ force: false });
			}, nextAt - now);
			return;
		}

		lastRecommendation = recommendation;
		lastRecommendationAt = now;
		safeLog(
			"info",
			`pushing recommendation viewers=${summary.viewerCount} bitrate=${recommendation.videoBitrate} codec=${recommendation.videoCodec} reason=${recommendation.reason}`
		);
		sendToStreamer({ type: "recommended-settings", ...recommendation });
	};

	const upsertViewer = (socketId, capabilities) => {
		viewerStore.upsertViewer(sessionId, socketId, capabilities);
		recomputeAndPush();
	};

	const removeViewer = (socketId) => {
		viewerStore.removeViewer(sessionId, socketId);
		recomputeAndPush();
	};

	const attachStreamer = (socketId, { initialCeiling, currentSettings, autoAdapt }) => {
		streamerSocketId = socketId;
		ceiling = initialCeiling || null;
		if (typeof autoAdapt === "boolean") autoAdaptEnabled = autoAdapt;
		safeLog("info", `streamer attached socketId=${socketId} ceilingBitrate=${ceiling?.videoBitrate ?? "?"} ceilingCodec=${ceiling?.videoCodec ?? "?"}`);
		recomputeAndPush({ force: true });
		return {
			summary: viewerStore.getSummary(sessionId),
			recommendation: lastRecommendation,
			autoAdapt: autoAdaptEnabled,
		};
	};

	const detachStreamer = (socketId, { reason = "" } = {}) => {
		if (streamerSocketId !== socketId) return false;
		streamerSocketId = null;
		safeLog("info", `streamer detached reason=${reason}`);
		return true;
	};

	const ackRecommendation = (socketId, ack) => {
		if (streamerSocketId !== socketId) return;
		safeLog("info", `ack received applied=${ack.applied} clampedBy=${ack.clampedBy || "none"} reason=${ack.reason || ""}`);
		fanoutToViewers({ type: "streamer-ack-broadcast", ack });
	};

	const setAutoAdapt = (socketId, enabled) => {
		if (streamerSocketId !== socketId) return false;
		const next = Boolean(enabled);
		if (next === autoAdaptEnabled) return false;
		autoAdaptEnabled = next;
		safeLog("info", `auto-adapt toggled to ${autoAdaptEnabled ? "on" : "off"}`);
		recomputeAndPush({ force: true });
		return true;
	};

	const isEmpty = () => viewerStore.sessionCount() === 0 && !streamerSocketId;

	const teardown = () => {
		if (pendingRecomputeTimer) {
			clearTimeout(pendingRecomputeTimer);
			pendingRecomputeTimer = null;
		}
		viewerStore.dropSession(sessionId);
		streamerSocketId = null;
	};

	return {
		sessionId,
		upsertViewer,
		removeViewer,
		attachStreamer,
		detachStreamer,
		ackRecommendation,
		setAutoAdapt,
		recomputeAndPush,
		isEmpty,
		teardown,
		getStreamerSocketId: () => streamerSocketId,
	};
};

const createControlRegistry = ({ log } = {}) => {
	const sessions = new Map();

	const ensureSession = (sessionId, emit) => {
		let session = sessions.get(sessionId);
		if (!session) {
			session = createControlSession({ sessionId, emit, log });
			sessions.set(sessionId, session);
		}
		return session;
	};

	const drop = (sessionId) => {
		const session = sessions.get(sessionId);
		if (!session) return;
		session.teardown();
		sessions.delete(sessionId);
	};

	const get = (sessionId) => sessions.get(sessionId) || null;

	const cleanupIfEmpty = (sessionId) => {
		const session = sessions.get(sessionId);
		if (!session) return;
		if (session.isEmpty()) drop(sessionId);
	};

	return {
		ensureSession,
		drop,
		get,
		cleanupIfEmpty,
		sessions: () => [...sessions.values()],
	};
};

export { createControlSession, createControlRegistry, MIN_RECOMMENDATION_INTERVAL_MS };
