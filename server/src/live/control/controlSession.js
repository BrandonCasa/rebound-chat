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
 * Defence-in-depth against transient bandwidth blips that would cause
 * viewers to rebuffer if we acted on them:
 *
 *   1. Per-viewer sample smoothing (`viewerStore.js`) — every viewer
 *      keeps a 30-second rolling buffer of measured downlinks; the
 *      aggregator picks the 25th percentile. A single 1-second spike
 *      upward never makes it past this layer.
 *
 *   2. `isMeaningfulChange` (`recommender.js`) — a 10% delta gate
 *      stops sub-fractional fluctuations from triggering FFmpeg
 *      respawns even when the smoothed signal does move a touch.
 *
 *   3. `MIN_RECOMMENDATION_INTERVAL_MS` — the minimum gap between any
 *      two pushes regardless of direction. Stops a flurry of viewer
 *      reconnects from spamming the streamer.
 *
 *   4. `RAISE_DWELL_MS` — the minimum improvement window before we
 *      ask the streamer to raise quality back up toward the ceiling.
 *      A previously-poor viewer's disconnect that lasts only a second
 *      or two should NOT cause an FFmpeg respawn: respawning is
 *      expensive (every viewer sees a 1-3s rebuffer at
 *      `EXT-X-DISCONTINUITY`) and a transient blip is the worst time
 *      to spend that. Downward moves remain immediate so viewers are
 *      protected from buffering as soon as the worst link tightens.
 */

import { ADAPTING_STATE, MSG } from "../../../../shared/streaming/protocol.js";
import { buildRecommendation, codecFamilyOf, CODEC_FAMILY_RANK, isMeaningfulChange } from "./recommender.js";
import { createViewerStore } from "./viewerStore.js";

const MIN_RECOMMENDATION_INTERVAL_MS = 2_000;
const RAISE_DWELL_MS = 8_000;
// Safety net: if the streamer never acks (process crashed mid-respawn,
// websocket drops without a proper goodbye, etc.) the viewers should
// not be stuck looking at "host is adjusting…" forever. The pipeline's
// own respawn rarely exceeds 3s, so an 8s grace window is generous.
const ADAPTING_TIMEOUT_MS = 8_000;

const NUMERIC_DIRECTION_FIELDS = ["videoBitrate", "outputWidth", "outputHeight", "fps"];

/**
 * Compare two recommendations and return whether the next one moves
 * quality up (toward the ceiling), down (away from it), or sideways.
 * "Down" wins when there's any conflict so we never delay a quality
 * cut behind a quality raise.
 *
 * @param {import("../../../../shared/streaming/types.js").RecommendedSettings | null} previous
 * @param {import("../../../../shared/streaming/types.js").RecommendedSettings} next
 * @returns {"up" | "down" | "same"}
 */
const recommendationDirection = (previous, next) => {
	if (!previous || !next) return "same";
	let sawUp = false;
	let sawDown = false;
	for (const field of NUMERIC_DIRECTION_FIELDS) {
		const prev = previous[field];
		const cur = next[field];
		if (typeof prev !== "number" || typeof cur !== "number") continue;
		if (cur > prev) sawUp = true;
		else if (cur < prev) sawDown = true;
	}
	const prevRank = CODEC_FAMILY_RANK.indexOf(codecFamilyOf(previous.videoCodec));
	const nextRank = CODEC_FAMILY_RANK.indexOf(codecFamilyOf(next.videoCodec));
	if (prevRank >= 0 && nextRank >= 0 && prevRank !== nextRank) {
		if (nextRank < prevRank) sawUp = true;
		else sawDown = true;
	}
	if (sawDown) return "down";
	if (sawUp) return "up";
	return "same";
};

const createControlSession = ({
	sessionId,
	emit,
	log,
	raiseDwellMs = RAISE_DWELL_MS,
	minIntervalMs = MIN_RECOMMENDATION_INTERVAL_MS,
	adaptingTimeoutMs = ADAPTING_TIMEOUT_MS,
} = {}) => {
	const viewerStore = createViewerStore();
	let ceiling = null;
	let lastRecommendation = null;
	let lastRecommendationAt = 0;
	let pendingRecomputeTimer = null;
	let pendingRaiseTimer = null;
	let pendingRaiseSince = 0;
	let streamerSocketId = null;
	let autoAdaptEnabled = true;
	// State of the most-recent server→streamer recommendation push, as
	// observed by viewers. `null` means the pipeline is steady; non-null
	// means we sent a `recommended-settings` and have not yet seen the
	// streamer's matching ack (or the safety timeout). Only ever
	// mutated through `markAdaptingPending` / `clearAdaptingState` so
	// the fan-out and safety timer stay in lock-step with the value.
	let adaptingState = null;
	let adaptingTimeoutTimer = null;

	const cancelPendingRaise = () => {
		if (!pendingRaiseTimer) return;
		clearTimeout(pendingRaiseTimer);
		pendingRaiseTimer = null;
		pendingRaiseSince = 0;
	};

	const cancelAdaptingTimeout = () => {
		if (!adaptingTimeoutTimer) return;
		clearTimeout(adaptingTimeoutTimer);
		adaptingTimeoutTimer = null;
	};

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

	const buildAdaptingEnvelope = (state) => {
		if (!adaptingState) return null;
		return {
			type: MSG.STREAMER_ADAPTING_BROADCAST,
			sessionId,
			state,
			target: adaptingState.target,
			reason: adaptingState.reason,
			direction: adaptingState.direction,
			derivedFromViewerCount: adaptingState.derivedFromViewerCount,
			generation: adaptingState.generation,
			since: adaptingState.since,
			updatedAt: Date.now(),
		};
	};

	const markAdaptingPending = ({ recommendation, direction }) => {
		cancelAdaptingTimeout();
		const now = Date.now();
		adaptingState = {
			target: {
				videoBitrate: recommendation.videoBitrate,
				videoCodec: recommendation.videoCodec,
				outputWidth: recommendation.outputWidth,
				outputHeight: recommendation.outputHeight,
				fps: recommendation.fps,
			},
			reason: recommendation.reason || "",
			direction,
			derivedFromViewerCount: recommendation.derivedFromViewerCount ?? null,
			generation: now,
			since: now,
		};
		fanoutToViewers(buildAdaptingEnvelope(ADAPTING_STATE.PENDING));
		adaptingTimeoutTimer = setTimeout(() => {
			adaptingTimeoutTimer = null;
			if (!adaptingState) return;
			safeLog("warn", `adaptation timeout fired without a streamer ack — clearing pending state generation=${adaptingState.generation}`);
			clearAdaptingState({ reason: "timeout" });
		}, adaptingTimeoutMs);
	};

	const clearAdaptingState = ({ reason } = {}) => {
		if (!adaptingState) {
			cancelAdaptingTimeout();
			return false;
		}
		const envelope = buildAdaptingEnvelope(ADAPTING_STATE.CLEARED);
		cancelAdaptingTimeout();
		adaptingState = null;
		if (envelope) {
			if (reason) envelope.reason = reason;
			fanoutToViewers(envelope);
		}
		return true;
	};

	const recomputeAndPush = ({ force = false, fromRaiseTimer = false } = {}) => {
		if (pendingRecomputeTimer) {
			clearTimeout(pendingRecomputeTimer);
			pendingRecomputeTimer = null;
		}

		const summary = viewerStore.getSummary(sessionId);
		fanoutToViewers({ type: MSG.VIEWER_SUMMARY_BROADCAST, summary });
		sendToStreamer({ type: MSG.VIEWER_SUMMARY, ...summary });

		if (!ceiling) return;
		if (!autoAdaptEnabled && !force) return;

		const recommendation = buildRecommendation({
			sessionId,
			summary,
			viewerSnapshots: viewerStore.listViewerSnapshots(sessionId),
			ceiling,
		});

		if (!recommendation) {
			cancelPendingRaise();
			return;
		}
		if (!force && !isMeaningfulChange(lastRecommendation, recommendation)) {
			// Nothing meaningful changed since the last push. If a raise is
			// pending, leave it alone — its dwell is still ticking against the
			// same target. If conditions had actually improved further we would
			// hit isMeaningfulChange=true and re-enter the branches below.
			return;
		}

		const direction = recommendationDirection(lastRecommendation, recommendation);

		// Defer upward moves: we only ask the streamer to raise quality after
		// `raiseDwellMs` of *uninterrupted* improvement. A forced push (auto-
		// adapt toggled on, streamer (re-)attached, viewer summary requested
		// a fresh recommendation) bypasses the dwell so the streamer's first
		// push is always immediate. A push fired by the dwell timer itself
		// also bypasses the branch — that's how we exit the wait state.
		if (!force && !fromRaiseTimer && direction === "up") {
			if (!pendingRaiseTimer) {
				pendingRaiseSince = Date.now();
				pendingRaiseTimer = setTimeout(() => {
					pendingRaiseTimer = null;
					pendingRaiseSince = 0;
					recomputeAndPush({ fromRaiseTimer: true });
				}, raiseDwellMs);
				safeLog("info", `raise pending — waiting ${raiseDwellMs}ms before promoting bitrate=${recommendation.videoBitrate} codec=${recommendation.videoCodec}`);
			}
			return;
		}

		// Either the recommendation is a downgrade (apply now to protect
		// viewers), the raise dwell timer just fired (the wait is satisfied,
		// re-evaluate against the fresh summary), or a force push is in
		// flight. In every case we drop any still-armed raise — its window is
		// moot now.
		cancelPendingRaise();

		const now = Date.now();
		const nextAt = lastRecommendationAt + minIntervalMs;
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
			`pushing recommendation viewers=${summary.viewerCount} bitrate=${recommendation.videoBitrate} codec=${recommendation.videoCodec} direction=${direction} reason=${recommendation.reason}`
		);
		const delivered = sendToStreamer({ type: "recommended-settings", ...recommendation });
		// Only flag the pipeline as "adapting" when the recommendation
		// actually went out the wire to a streamer. If no streamer is
		// attached the push is a no-op and viewers should not be told
		// anyone is adjusting on their behalf.
		if (delivered) markAdaptingPending({ recommendation, direction });
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
		// A fresh attach (or re-attach) means whatever adapting-window
		// was in flight no longer reflects reality. Clear it before the
		// force-push below so viewers don't see stale "host adjusting"
		// chrome from a previous streamer process.
		clearAdaptingState({ reason: "streamer_reattach" });
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
		// The streamer can no longer ack — clear any pending adapting
		// state so viewers stop seeing "host adjusting" the moment the
		// streamer is known to be gone.
		clearAdaptingState({ reason: `streamer_detached:${reason || "unknown"}` });
		safeLog("info", `streamer detached reason=${reason}`);
		return true;
	};

	const ackRecommendation = (socketId, ack) => {
		if (streamerSocketId !== socketId) return;
		safeLog("info", `ack received applied=${ack.applied} clampedBy=${ack.clampedBy || "none"} reason=${ack.reason || ""}`);
		fanoutToViewers({ type: MSG.STREAMER_ACK_BROADCAST, ack });
		clearAdaptingState({ reason: "streamer_ack" });
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
		cancelPendingRaise();
		cancelAdaptingTimeout();
		adaptingState = null;
		viewerStore.dropSession(sessionId);
		streamerSocketId = null;
	};

	const getAdaptingSnapshot = () => {
		if (!adaptingState) return null;
		return {
			state: ADAPTING_STATE.PENDING,
			sessionId,
			target: adaptingState.target,
			reason: adaptingState.reason,
			direction: adaptingState.direction,
			derivedFromViewerCount: adaptingState.derivedFromViewerCount,
			generation: adaptingState.generation,
			since: adaptingState.since,
		};
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
		getPendingRaiseSince: () => pendingRaiseSince,
		hasPendingRaise: () => Boolean(pendingRaiseTimer),
		getAdaptingSnapshot,
		hasPendingAdaptation: () => Boolean(adaptingState),
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

export { createControlSession, createControlRegistry, recommendationDirection, MIN_RECOMMENDATION_INTERVAL_MS, RAISE_DWELL_MS };
