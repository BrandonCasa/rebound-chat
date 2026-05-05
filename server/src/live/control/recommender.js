/**
 * Pure recommender: turns an aggregated `ViewerSummary` plus the
 * streamer's ceiling into a `RecommendedSettings` payload (or null when
 * nothing useful can be recommended yet — e.g. no viewers, or the
 * summary hasn't gathered enough data).
 *
 * The numeric outputs are *upper bounds*. The streamer-side adapter
 * runs `min(current, recommended, ceiling)` again for belt-and-braces;
 * we apply the same clamp here so we never even ask the streamer to
 * raise its quality.
 *
 * Heuristics implemented today:
 *
 *   1. Bitrate.  Take the worst (minimum) effective downlink, multiply
 *      by 0.7 (safety margin against handshake/protocol overhead and
 *      bursty CDN pulls), then by 0.8 to leave headroom for the audio
 *      track + the player's own jitter buffer. Floor at 500 kbps so we
 *      never recommend a literally unplayable bitrate; cap at the
 *      ceiling.
 *
 *      ABR death-spiral guard. `hls.bandwidthEstimate` (the source of
 *      `minDownlinkMbit` for the common case) is structurally bounded
 *      *above* by the bitrate the streamer is currently emitting:
 *      smaller segments don't have enough bytes in flight to outrun the
 *      per-fragment TTFB / TLS-resume overhead, and VBR motion troughs
 *      shrink segments well below the configured ceiling. Once the
 *      streamer drops in response to one such measurement, the next
 *      measurement is bounded by the new lower rate, justifying another
 *      drop, and so on until we hit `ABSOLUTE_FLOOR_BPS`. We break the
 *      cycle two ways:
 *
 *        a) Inconclusive-zone hold. If the proposed candidate is below
 *           the streamer's *current* bitrate but the measured downlink
 *           is within ~`INCONCLUSIVE_RATIO` of `currentBps`, the link
 *           may simply be delivering exactly what we asked of it — that
 *           tells us nothing about real capacity. Hold at `currentBps`
 *           rather than ratchet down.
 *
 *        b) `maxLoadFraction` override. The viewer probe also reports
 *           the rolling avg of `segmentLoadDuration / playableDuration`
 *           per fragment, which is NOT bounded by the encoded rate. A
 *           low value (≈0 → segments arriving in a small fraction of
 *           their playback duration) is unambiguous evidence the link
 *           has spare capacity; a value approaching 1.0 (segments
 *           taking nearly as long to load as to play) is unambiguous
 *           congestion. We let `maxLoadFraction < HEADROOM_THRESHOLD`
 *           bypass the hold (so the recommender can actually climb
 *           back to ceiling), and let `maxLoadFraction >=
 *           CONGESTION_THRESHOLD` waive the hold so a real drop is
 *           still applied.
 *
 *   2. Codec.  Pick the highest-efficiency codec in the intersection of
 *      what every viewer can decode AND what the ceiling permits. The
 *      ranking is AV1 > HEVC > H.264 > VP9 because that is also the
 *      bandwidth-efficiency ranking for live encode. If the ceiling
 *      pins a specific codec, only suggest a different one if the
 *      ceiling's family is missing from the intersection.
 *
 *   3. Resolution. Use the largest viewport (devicePixelRatio-adjusted)
 *      across all viewers, but never above the ceiling. Snap to a small
 *      ladder of common heights so we don't churn FFmpeg over a single
 *      pixel.
 *
 *   4. FPS.  Always recommend the ceiling's fps unless every viewer's
 *      `effectiveType` is "2g" or "slow-2g", in which case drop to
 *      max(15, ceilingFps/2). Frame-rate drops are far more visually
 *      jarring than bitrate drops, so we are conservative.
 */

const RESOLUTION_LADDER = [360, 480, 540, 720, 900, 1080, 1440, 2160];

const CODEC_FAMILY_RANK = ["av1", "hevc", "h264", "vp9"];

const SAFETY_MULTIPLIER = 0.7;
const HEADROOM_MULTIPLIER = 0.8;
const ABSOLUTE_FLOOR_BPS = 500_000;
const SIGNIFICANT_DELTA = 0.1;

// "Inconclusive zone" for the bandwidth-estimate downshift gate. When
// the smoothed downlink lands within this fraction of the streamer's
// current bitrate (i.e. the link is delivering ~100% of what we asked
// for), the measurement carries no information about true capacity —
// hls.js' segment-throughput EWMA is bounded above by the encoded rate.
// Only treat downlinks below this ratio as real evidence of congestion.
const INCONCLUSIVE_RATIO = 0.85;

// `maxLoadFraction` thresholds. Load fraction = segmentLoadDurationMs /
// segmentPlayableDurationMs, averaged over recent fragments per viewer.
// Below `HEADROOM_THRESHOLD`, every viewer's segments are arriving in a
// small slice of their playback duration → the link clearly has spare
// capacity, regardless of what the bandwidth estimate looks like. At or
// above `CONGESTION_THRESHOLD`, a viewer is barely keeping up → real
// congestion; trust the downshift even if the downlink reading looks
// inconclusive.
const HEADROOM_LOAD_FRACTION = 0.4;
const CONGESTION_LOAD_FRACTION = 0.85;

const PROCESSED_INFINITY = (value) => (typeof value === "number" && Number.isFinite(value) ? value : null);

const codecFamilyOf = (codec) => {
	if (!codec || typeof codec !== "string") return null;
	if (codec.includes("h264") || codec.startsWith("libx264") || codec === "libopenh264") return "h264";
	if (codec.includes("hevc") || codec === "libx265" || codec === "libkvazaar") return "hevc";
	if (codec.includes("av1") || codec === "libsvtav1" || codec === "libaom-av1") return "av1";
	if (codec.includes("vp9") || codec === "libvpx-vp9") return "vp9";
	return null;
};

const snapToLadder = (height) => {
	if (typeof height !== "number" || !Number.isFinite(height) || height <= 0) return null;
	let snapped = RESOLUTION_LADDER[0];
	for (const step of RESOLUTION_LADDER) {
		if (step <= height) snapped = step;
	}
	return snapped;
};

const recommendBitrate = ({ minDownlinkMbit, ceiling, currentBps, maxLoadFraction }) => {
	if (!ceiling || typeof ceiling.videoBitrate !== "number") return null;
	if (typeof minDownlinkMbit !== "number" || minDownlinkMbit <= 0) {
		return ceiling.videoBitrate;
	}

	const downlinkBps = minDownlinkMbit * 1_000_000;
	const candidate = Math.round(downlinkBps * SAFETY_MULTIPLIER * HEADROOM_MULTIPLIER);

	const haveLoadFraction = typeof maxLoadFraction === "number" && Number.isFinite(maxLoadFraction);
	const linkClearlyHasHeadroom = haveLoadFraction && maxLoadFraction < HEADROOM_LOAD_FRACTION;
	const linkClearlyCongested = haveLoadFraction && maxLoadFraction >= CONGESTION_LOAD_FRACTION;

	// Path 1: load-fraction headroom override. Every viewer's segments
	// are arriving in a small slice of their playable duration — there
	// is real, unambiguous spare capacity on the link. Aim for the
	// ceiling regardless of what the bandwidth estimate looks like
	// (the controlSession's raise dwell still throttles the jump). This
	// is what lets the recommender climb back to ceiling after a drop;
	// without it, every measurement is pinned near `currentBps` and
	// the system gets stuck at the first downward step.
	if (linkClearlyHasHeadroom) {
		return Math.max(ABSOLUTE_FLOOR_BPS, ceiling.videoBitrate);
	}

	// Path 2: inconclusive-zone downshift gate. The proposed candidate
	// is below the streamer's current bitrate, but the measured
	// downlink is in the "we delivered exactly what was asked of us"
	// zone — hls.js' EWMA can't see capacity above what the encoder is
	// emitting, so this measurement is uninformative. Hold the line.
	// We waive the hold when load-fraction reports real congestion
	// (`linkClearlyCongested`) so genuine drops still apply.
	if (typeof currentBps === "number" && Number.isFinite(currentBps) && currentBps > 0 && candidate < currentBps && !linkClearlyCongested) {
		if (downlinkBps >= currentBps * INCONCLUSIVE_RATIO) {
			return Math.max(ABSOLUTE_FLOOR_BPS, Math.min(currentBps, ceiling.videoBitrate));
		}
	}

	const clamped = Math.max(ABSOLUTE_FLOOR_BPS, Math.min(candidate, ceiling.videoBitrate));
	return clamped;
};

const recommendCodec = ({ supportedCodecs, ceiling }) => {
	if (!ceiling?.videoCodec) return null;
	const ceilingFamily = codecFamilyOf(ceiling.videoCodec);
	if (!ceilingFamily) return ceiling.videoCodec;
	if (!Array.isArray(supportedCodecs) || supportedCodecs.length === 0) {
		return ceiling.videoCodec;
	}
	if (supportedCodecs.includes(ceilingFamily)) {
		return ceiling.videoCodec;
	}
	for (const family of CODEC_FAMILY_RANK) {
		if (!supportedCodecs.includes(family)) continue;
		if (ceiling.videoCodec.endsWith("_nvenc")) return `${family}_nvenc`;
		if (ceiling.videoCodec.endsWith("_qsv")) return `${family}_qsv`;
		if (ceiling.videoCodec.endsWith("_amf")) return `${family}_amf`;
		if (ceiling.videoCodec.endsWith("_videotoolbox")) return `${family}_videotoolbox`;
		if (family === "h264") return "libopenh264";
		if (family === "hevc") return "libx265";
		if (family === "av1") return "libsvtav1";
		if (family === "vp9") return "libvpx-vp9";
	}
	return ceiling.videoCodec;
};

const recommendResolution = ({ maxResolution, ceiling }) => {
	const ceilingHeight = ceiling?.outputHeight ?? null;
	const ceilingWidth = ceiling?.outputWidth ?? null;
	const ceilingAspect = ceilingHeight && ceilingWidth ? ceilingWidth / ceilingHeight : 16 / 9;

	if (!maxResolution || !maxResolution.h) {
		return { outputWidth: ceilingWidth, outputHeight: ceilingHeight };
	}

	const targetHeight = ceilingHeight ? Math.min(maxResolution.h, ceilingHeight) : maxResolution.h;
	const snapped = snapToLadder(targetHeight);
	if (!snapped) return { outputWidth: ceilingWidth, outputHeight: ceilingHeight };
	const snappedWidth = Math.round((snapped * ceilingAspect) / 2) * 2;
	return {
		outputWidth: ceilingWidth ? Math.min(snappedWidth, ceilingWidth) : snappedWidth,
		outputHeight: snapped,
	};
};

const recommendFps = ({ viewerSnapshots, ceiling }) => {
	if (!ceiling?.fps) return null;
	if (!Array.isArray(viewerSnapshots) || viewerSnapshots.length === 0) return ceiling.fps;
	const allSlow = viewerSnapshots.every((viewer) => {
		const type = viewer?.network?.effectiveType;
		return type === "2g" || type === "slow-2g";
	});
	if (!allSlow) return ceiling.fps;
	return Math.max(15, Math.round(ceiling.fps / 2));
};

const parseBitrateValueToBps = (value) => {
	if (value == null) return null;
	if (typeof value === "number") return Number.isFinite(value) && value > 0 ? value : null;
	if (typeof value !== "string") return null;
	const text = value.trim().toLowerCase();
	if (!text) return null;
	const match = /^([\d.]+)\s*([kmg]?)/.exec(text);
	if (!match) return null;
	const n = Number.parseFloat(match[1]);
	if (!Number.isFinite(n) || n <= 0) return null;
	const unit = match[2];
	if (unit === "g") return Math.round(n * 1_000_000_000);
	if (unit === "m") return Math.round(n * 1_000_000);
	if (unit === "k") return Math.round(n * 1_000);
	return Math.round(n);
};

/**
 * Build a recommendation. Returns null when there's nothing meaningful
 * to push (e.g. zero viewers and the previous push was already empty).
 *
 * @param {{
 *   sessionId: string,
 *   summary: import("../../../../shared/streaming/types.js").ViewerSummary,
 *   viewerSnapshots: import("../../../../shared/streaming/types.js").ViewerCapabilities[],
 *   ceiling: import("../../../../shared/streaming/types.js").InitialCeiling | null,
 *   currentSettings?: { videoBitrate?: number | string | null } | null,
 * }} input
 * @returns {import("../../../../shared/streaming/types.js").RecommendedSettings | null}
 */
const buildRecommendation = ({ sessionId, summary, viewerSnapshots, ceiling, currentSettings = null }) => {
	if (!ceiling) return null;
	if (!summary || summary.viewerCount === 0) {
		return {
			sessionId,
			videoBitrate: ceiling.videoBitrate,
			videoCodec: ceiling.videoCodec,
			outputWidth: ceiling.outputWidth,
			outputHeight: ceiling.outputHeight,
			fps: ceiling.fps,
			reason: "no viewers connected — restoring user ceiling",
			derivedFromViewerCount: 0,
			updatedAt: Date.now(),
		};
	}

	const currentBps = parseBitrateValueToBps(currentSettings?.videoBitrate ?? null);
	const maxLoadFraction = typeof summary.maxLoadFraction === "number" ? summary.maxLoadFraction : null;

	const videoBitrate = recommendBitrate({
		minDownlinkMbit: summary.minDownlinkMbit,
		ceiling,
		currentBps,
		maxLoadFraction,
	});
	const videoCodec = recommendCodec({ supportedCodecs: summary.supportedCodecs, ceiling });
	const { outputWidth, outputHeight } = recommendResolution({ maxResolution: summary.maxResolution, ceiling });
	const fps = recommendFps({ viewerSnapshots, ceiling });

	const reasons = [];
	if (typeof summary.minDownlinkMbit === "number") {
		reasons.push(`worst viewer downlink ${summary.minDownlinkMbit.toFixed(2)} Mbit/s`);
	}
	if (typeof maxLoadFraction === "number") {
		reasons.push(`worst-viewer segment load fraction ${maxLoadFraction.toFixed(2)}`);
	}
	if (currentBps != null && typeof videoBitrate === "number" && videoBitrate === currentBps && videoBitrate < ceiling.videoBitrate) {
		reasons.push("held current bitrate — measurement inconclusive (downlink ≈ encoded rate)");
	}
	if (videoCodec !== ceiling.videoCodec) {
		reasons.push(`codec demoted from ${ceiling.videoCodec} (intersection: ${summary.supportedCodecs.join(", ") || "n/a"})`);
	}
	if (outputHeight && ceiling.outputHeight && outputHeight < ceiling.outputHeight) {
		reasons.push(`resolution snapped to ${outputWidth}x${outputHeight} from ${ceiling.outputWidth}x${ceiling.outputHeight}`);
	}
	if (fps && ceiling.fps && fps < ceiling.fps) {
		reasons.push(`fps dropped to ${fps} from ${ceiling.fps} for slow-network viewers`);
	}

	return {
		sessionId,
		videoBitrate,
		videoCodec,
		outputWidth,
		outputHeight,
		fps,
		reason: reasons.join("; ") || "viewers within ceiling — no change",
		derivedFromViewerCount: summary.viewerCount,
		updatedAt: Date.now(),
	};
};

const numericChangedSignificantly = (current, next) => {
	if (typeof current !== "number" || typeof next !== "number") return current !== next;
	if (current === 0 && next === 0) return false;
	if (current === 0) return true;
	return Math.abs(next - current) / current > SIGNIFICANT_DELTA;
};

/**
 * Should we push the new recommendation to the streamer? We only do so
 * if a numeric field moved by more than 10%, or any string field
 * (codec) changed. This stops us from spamming respawns over single-
 * fragment hls.js bandwidth blips.
 */
const isMeaningfulChange = (previous, next) => {
	if (!next) return false;
	if (!previous) return true;
	if (previous.videoCodec !== next.videoCodec) return true;
	if (numericChangedSignificantly(previous.videoBitrate, next.videoBitrate)) return true;
	if (numericChangedSignificantly(previous.outputWidth, next.outputWidth)) return true;
	if (numericChangedSignificantly(previous.outputHeight, next.outputHeight)) return true;
	if (numericChangedSignificantly(previous.fps, next.fps)) return true;
	if (PROCESSED_INFINITY(previous.derivedFromViewerCount) !== PROCESSED_INFINITY(next.derivedFromViewerCount)) {
		return previous.viewerCount !== next.viewerCount;
	}
	return false;
};

export {
	buildRecommendation,
	isMeaningfulChange,
	codecFamilyOf,
	snapToLadder,
	recommendBitrate,
	parseBitrateValueToBps,
	RESOLUTION_LADDER,
	CODEC_FAMILY_RANK,
	SIGNIFICANT_DELTA,
	ABSOLUTE_FLOOR_BPS,
	INCONCLUSIVE_RATIO,
	HEADROOM_LOAD_FRACTION,
	CONGESTION_LOAD_FRACTION,
};
