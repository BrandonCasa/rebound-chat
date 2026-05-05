/**
 * Pure adapter: takes (currentSettings, recommendation, ceiling) and
 * returns the next clamped settings + a description of what changed.
 *
 * Three invariants:
 *
 *   1. Ceiling-bounded.  No numeric field can ever rise above the
 *      user's original ceiling. The server applies the same clamp
 *      before sending; this is the belt to that pair of braces.
 *
 *   2. Bidirectional within the ceiling.  When viewer conditions
 *      improve (e.g. a slow viewer leaves, or only fast viewers join)
 *      the recommendation can ask the streamer to raise quality back
 *      up — but never above what the user originally selected. Raise
 *      flapping is prevented on the *server* side via a dwell window
 *      in `controlSession.js`; the adapter itself just trusts what it
 *      receives.
 *
 *   3. Codec swaps are capability-aware. We never blindly *promote*
 *      the codec family (e.g. h264 → av1) because the user's box may
 *      not be able to encode the new codec at all. We allow:
 *        a) the same-hardware-family ladder (e.g. hevc_nvenc ↔
 *           h264_nvenc) — the user's box demonstrably has that
 *           backend already;
 *        b) returning to the *exact* ceiling codec — that was the
 *           user's verified intent at stream start, so it's safe to
 *           restore even after a temporary cross-family demotion.
 *      The recommender is the one allowed to demote h264 → vp9 when
 *      literally nobody can decode h264; the adapter holds at the
 *      current codec until the recommendation matches one of the safe
 *      paths above.
 *
 * Returns `{ next, diff, clampedBy }`. `clampedBy` is non-null when the
 * ceiling pulled a value tighter than the recommendation asked for —
 * useful for the streamer to communicate "we kept it tighter than the
 * server suggested because of your initial choice."
 */

import { parseBitrateToBps } from "../codecs.js";

const NUMERIC_FIELDS = ["videoBitrate", "outputWidth", "outputHeight", "fps"];

const toBpsOrNull = (value) => {
	if (value == null) return null;
	if (typeof value === "number") return Number.isFinite(value) && value > 0 ? value : null;
	try {
		return parseBitrateToBps(value);
	} catch (_err) {
		return null;
	}
};

const toBitrateString = (bps) => {
	if (typeof bps !== "number" || !Number.isFinite(bps) || bps <= 0) return null;
	if (bps >= 1_000_000) return `${(bps / 1_000_000).toFixed(2).replace(/\.00$/, "")}M`;
	if (bps >= 1_000) return `${Math.round(bps / 1_000)}k`;
	return `${bps}`;
};

const codecsCompatibleForRespawn = (currentCodec, recommendedCodec, ceilingCodec) => {
	if (!currentCodec) return true;
	if (!recommendedCodec) return false;
	if (currentCodec === recommendedCodec) return true;
	if (ceilingCodec && recommendedCodec === ceilingCodec) return true;
	const trim = (value) => value.replace(/^h264_|^hevc_|^av1_|^vp9_/, "");
	return trim(currentCodec) === trim(recommendedCodec);
};

/**
 * @param {import("../types.js").StreamConfig} current
 * @param {import("../../../shared/streaming/types.js").RecommendedSettings} recommendation
 * @param {import("../../../shared/streaming/types.js").InitialCeiling} ceiling
 * @param {{ allowResolutionAdaptation?: boolean }} [options]
 *   `allowResolutionAdaptation` (default `true`) controls whether the
 *   `outputWidth`/`outputHeight` fields participate in adaptation. When
 *   `false`, the adapter pins the resolution at whatever the streamer is
 *   currently emitting and only adjusts bitrate, fps, and codec. This is
 *   useful when the user wants viewer-driven downshifts without the
 *   visible "the picture just got fuzzy" jolt that resolution changes
 *   cause across the HLS variant boundary.
 * @returns {{
 *   next: Partial<import("../types.js").StreamConfig>,
 *   diff: Array<{ field: string, from: any, to: any }>,
 *   clampedBy: string | null,
 *   wouldRespawn: boolean,
 * }}
 */
const applyRecommendation = (current, recommendation, ceiling, options = {}) => {
	if (!current || !recommendation || !ceiling) {
		return { next: { ...current }, diff: [], clampedBy: null, wouldRespawn: false };
	}

	const allowResolutionAdaptation = options.allowResolutionAdaptation !== false;

	const next = { ...current };
	const diff = [];
	let clampedBy = null;

	const currentBps = toBpsOrNull(current.videoBitrate);
	const recommendedBps = toBpsOrNull(recommendation.videoBitrate);
	const ceilingBps = toBpsOrNull(ceiling.videoBitrate);
	if (recommendedBps != null && ceilingBps != null && currentBps != null) {
		const target = Math.min(recommendedBps, ceilingBps);
		if (target !== currentBps) {
			next.videoBitrate = toBitrateString(target);
			diff.push({ field: "videoBitrate", from: current.videoBitrate, to: next.videoBitrate });
			if (target === ceilingBps && ceilingBps < recommendedBps) clampedBy = "user-initial-ceiling";
		}
	}

	for (const field of ["outputWidth", "outputHeight", "fps"]) {
		if (!allowResolutionAdaptation && (field === "outputWidth" || field === "outputHeight")) continue;
		const currentValue = current[field];
		const recommendedValue = recommendation[field];
		const ceilingValue = ceiling[field];
		if (typeof currentValue !== "number" || typeof recommendedValue !== "number") continue;
		const ceilingNumber = typeof ceilingValue === "number" ? ceilingValue : Infinity;
		const target = Math.min(recommendedValue, ceilingNumber);
		if (target !== currentValue) {
			next[field] = target;
			diff.push({ field, from: currentValue, to: target });
			if (target === ceilingNumber && ceilingNumber < recommendedValue) clampedBy = "user-initial-ceiling";
		}
	}

	if (recommendation.videoCodec && recommendation.videoCodec !== current.videoCodec) {
		if (codecsCompatibleForRespawn(current.videoCodec, recommendation.videoCodec, ceiling.videoCodec)) {
			next.videoCodec = recommendation.videoCodec;
			diff.push({ field: "videoCodec", from: current.videoCodec, to: recommendation.videoCodec });
		}
	}

	const wouldRespawn = diff.length > 0;
	return { next, diff, clampedBy, wouldRespawn };
};

const summarizeDiff = (diff) => {
	if (!diff || !diff.length) return "no change";
	return diff.map((entry) => `${entry.field}: ${entry.from} → ${entry.to}`).join("; ");
};

export { applyRecommendation, summarizeDiff, codecsCompatibleForRespawn, NUMERIC_FIELDS, toBitrateString };
