/**
 * In-memory store of viewers per live session, keyed by sessionId.
 *
 * The store is intentionally process-local: live streams are tied to a
 * single ingest secret and a single FFmpeg pipeline, so all of a
 * session's viewers fan in to the same node anyway. If/when we
 * horizontally scale the live front-door, swap this for a Redis-backed
 * store of the same shape.
 *
 * Each viewer entry tracks two things:
 *
 *   - `capabilities`  the latest `ViewerCapabilities` payload we got
 *                     for that socket (codec/decoder/display info).
 *   - `samples`       a rolling buffer of recent downlink measurements.
 *                     Each sample is `{ t, mbit }`. We append on every
 *                     `upsertViewer` (provided the new payload carried
 *                     a measurable downlink) and prune by both age and
 *                     count.
 *
 * Aggregation is asymmetric: we report `min(latestSample, p25OfWindow)`
 * for each viewer. The two halves give us complementary properties:
 *
 *   - The 25th-percentile term protects the *upward* path. A single
 *     brief spike upward is one outlier and gets ignored — p25 still
 *     reflects the bulk of the window. A genuine improvement that
 *     holds across most of the window does pull p25 up.
 *
 *   - The latest-sample term protects the *downward* path. The
 *     moment a fresh low reading lands, `min(latest, p25)` drops to
 *     the new low — viewers don't have to wait for the percentile to
 *     "catch up" before the recommender starts protecting them.
 *
 * Together: spikes upward are smoothed away, but real bandwidth
 * collapses are reflected immediately. Combined with the dwell window
 * in `controlSession.js`, the upward path requires both p25 *and*
 * eight seconds of follow-through before we ask FFmpeg to respawn,
 * while the downward path stays as fast as the data arriving from
 * hls.js (level switches are reported without throttle).
 *
 * `aggregateViewers` and `effectiveDownlinkMbit` are still exported in
 * their original point-in-time form for callers (and tests) that want
 * the unsmoothed signal — e.g. an admin/debug panel showing the very
 * latest reading.
 */

const HISTORY_WINDOW_MS = 30_000;
const SMOOTHING_PERCENTILE = 0.25;
const MAX_SAMPLES = 32;

const MEDIAN = (values) => {
	if (!values.length) return null;
	const sorted = [...values].sort((a, b) => a - b);
	const middle = Math.floor(sorted.length / 2);
	if (sorted.length % 2 === 1) return sorted[middle];
	return (sorted[middle - 1] + sorted[middle]) / 2;
};

const MIN_FINITE = (values) => {
	let min = null;
	for (const value of values) {
		if (typeof value !== "number" || !Number.isFinite(value)) continue;
		if (min == null || value < min) min = value;
	}
	return min;
};

/**
 * Lower-percentile pick (no interpolation). With a sorted array of
 * length N, this returns the element at index `floor((N - 1) * p)`.
 * That guarantees the result is always an actually observed sample,
 * which is the property we want for "what bandwidth could this viewer
 * actually sustain?" — interpolation would invent bandwidth that the
 * link never demonstrated.
 */
const samplePercentile = (values, percentile) => {
	if (!Array.isArray(values) || values.length === 0) return null;
	if (typeof percentile !== "number" || !Number.isFinite(percentile)) return null;
	const clamped = Math.max(0, Math.min(1, percentile));
	const sorted = [...values].sort((a, b) => a - b);
	const idx = Math.floor((sorted.length - 1) * clamped);
	return sorted[idx];
};

/**
 * Drop samples older than `windowMs`, but never empty the buffer —
 * a viewer that goes silent should still contribute its last known
 * value (otherwise we'd suddenly look like we have free headroom and
 * the recommender would race to the ceiling). Also enforce a hard cap
 * on count as a defensive guard against pathological clients sending
 * a sample on every fragment.
 */
const trimSamples = (samples, now, windowMs) => {
	if (!samples) return samples;
	while (samples.length > 1 && now - samples[0].t > windowMs) {
		samples.shift();
	}
	while (samples.length > MAX_SAMPLES) {
		samples.shift();
	}
	return samples;
};

/**
 * Best-effort downlink for a single viewer's *current* snapshot.
 * Prefer the HLS-derived estimate (it's measured against actual segment
 * downloads) and fall back to `navigator.connection.downlink`. We never
 * trust either if `saveData` is set — that's a strong user-side hint to
 * keep it small regardless of the link's measured speed.
 *
 * Exported for backwards compatibility and for callers that explicitly
 * want the unsmoothed value (e.g. a debug overlay).
 */
const effectiveDownlinkMbit = (viewer) => {
	const network = viewer?.network || {};
	if (network.saveData) return 1.5;
	if (typeof network.hlsBandwidthEstimateMbit === "number" && network.hlsBandwidthEstimateMbit > 0) {
		return network.hlsBandwidthEstimateMbit;
	}
	if (typeof network.downlinkMbit === "number" && network.downlinkMbit > 0) {
		return network.downlinkMbit;
	}
	return null;
};

/**
 * Asymmetrically-smoothed per-viewer downlink derived from the rolling
 * sample buffer: `min(latestSample, percentile(samples))`.
 *
 * `saveData=true` continues to short-circuit to 1.5 Mbit so the user's
 * intent overrides any measurement. Returns null when no samples are
 * present (e.g. the viewer never reported a usable downlink yet).
 */
const smoothedEntryDownlinkMbit = (entry, { now, historyWindowMs, smoothingPercentile }) => {
	if (!entry) return null;
	const network = entry.capabilities?.network || {};
	if (network.saveData) return 1.5;
	const samples = entry.samples;
	if (!samples || samples.length === 0) {
		return effectiveDownlinkMbit(entry.capabilities);
	}
	trimSamples(samples, now, historyWindowMs);
	if (samples.length === 0) return effectiveDownlinkMbit(entry.capabilities);
	const values = samples.map((sample) => sample.mbit);
	const latest = values[values.length - 1];
	const percentile = samplePercentile(values, smoothingPercentile);
	if (typeof latest !== "number") return percentile;
	if (typeof percentile !== "number") return latest;
	return Math.min(latest, percentile);
};

/**
 * Pull a clamped `loadFractionAvg` (segment download ms / playback ms,
 * averaged over recent fragments) from a viewer's network probe. Values
 * are clamped to [0, 5] to bound the impact of a single anomalous
 * sample (e.g. a TCP reset retransmit that pads `loadDuration` orders
 * of magnitude beyond the playable duration). Returns `null` when the
 * viewer hasn't reported one yet (e.g. just connected, no FRAG_LOADED
 * has fired) so the recommender can fall back to the bandwidth-only
 * heuristics for legacy viewers.
 */
const viewerLoadFraction = (viewer) => {
	const value = viewer?.network?.loadFractionAvg;
	if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
	if (value > 5) return 5;
	return value;
};

const MAX_FINITE = (values) => {
	let max = null;
	for (const value of values) {
		if (typeof value !== "number" || !Number.isFinite(value)) continue;
		if (max == null || value > max) max = value;
	}
	return max;
};

const toMaxResolution = (viewers) => {
	let maxArea = 0;
	let result = null;
	for (const viewer of viewers) {
		const display = viewer?.display;
		if (!display) continue;
		const width = Math.round((display.viewportWidth || 0) * (display.devicePixelRatio || 1));
		const height = Math.round((display.viewportHeight || 0) * (display.devicePixelRatio || 1));
		if (width <= 0 || height <= 0) continue;
		const area = width * height;
		if (area > maxArea) {
			maxArea = area;
			result = { w: width, h: height };
		}
	}
	return result;
};

const intersectFamilies = (viewers) => {
	if (!viewers.length) return [];
	let intersection = null;
	for (const viewer of viewers) {
		const families = new Set(viewer?.supportedCodecFamilies || []);
		if (!intersection) {
			intersection = families;
			continue;
		}
		for (const family of [...intersection]) {
			if (!families.has(family)) intersection.delete(family);
		}
	}
	return intersection ? [...intersection] : [];
};

/**
 * Backwards-compatible aggregator over a list of capability snapshots
 * (no history). Used by callers that don't have a sample buffer to
 * hand — same behaviour as before the smoothing layer landed.
 */
const aggregateViewers = (viewerList, sessionId) => {
	const downlinks = viewerList.map(effectiveDownlinkMbit).filter((value) => typeof value === "number");
	const loadFractions = viewerList.map(viewerLoadFraction).filter((value) => typeof value === "number");
	return {
		sessionId,
		viewerCount: viewerList.length,
		minDownlinkMbit: MIN_FINITE(downlinks),
		medianDownlinkMbit: MEDIAN(downlinks),
		// Worst-viewer segment-load fraction. Used by the recommender as
		// a bandwidth-independent congestion / headroom signal — see
		// `recommender.js`.
		maxLoadFraction: MAX_FINITE(loadFractions),
		supportedCodecs: intersectFamilies(viewerList),
		maxResolution: toMaxResolution(viewerList),
		saveDataCount: viewerList.filter((viewer) => viewer?.network?.saveData).length,
		updatedAt: Date.now(),
	};
};

/**
 * Aggregator that consumes per-viewer entries (capabilities + sample
 * history). The downlink fields are computed via the smoothed
 * percentile so they reflect what the link can sustain rather than
 * its peak.
 */
const aggregateEntries = (entries, sessionId, options) => {
	const { now, historyWindowMs, smoothingPercentile } = options;
	const downlinks = entries
		.map((entry) => smoothedEntryDownlinkMbit(entry, { now, historyWindowMs, smoothingPercentile }))
		.filter((value) => typeof value === "number");
	const viewerList = entries.map((entry) => entry.capabilities).filter(Boolean);
	const loadFractions = viewerList.map(viewerLoadFraction).filter((value) => typeof value === "number");
	return {
		sessionId,
		viewerCount: viewerList.length,
		minDownlinkMbit: MIN_FINITE(downlinks),
		medianDownlinkMbit: MEDIAN(downlinks),
		maxLoadFraction: MAX_FINITE(loadFractions),
		supportedCodecs: intersectFamilies(viewerList),
		maxResolution: toMaxResolution(viewerList),
		saveDataCount: viewerList.filter((viewer) => viewer?.network?.saveData).length,
		updatedAt: now,
	};
};

const createViewerStore = ({ historyWindowMs = HISTORY_WINDOW_MS, smoothingPercentile = SMOOTHING_PERCENTILE, now = () => Date.now() } = {}) => {
	const sessions = new Map();

	const aggregationOptions = (currentNow) => ({
		now: currentNow,
		historyWindowMs,
		smoothingPercentile,
	});

	const ensureSession = (sessionId) => {
		let entry = sessions.get(sessionId);
		if (!entry) {
			entry = {
				viewers: new Map(),
				summary: aggregateEntries([], sessionId, aggregationOptions(now())),
				dirty: false,
			};
			sessions.set(sessionId, entry);
		}
		return entry;
	};

	const getSummary = (sessionId) => {
		const entry = ensureSession(sessionId);
		if (entry.dirty) {
			entry.summary = aggregateEntries([...entry.viewers.values()], sessionId, aggregationOptions(now()));
			entry.dirty = false;
		}
		return entry.summary;
	};

	const upsertViewer = (sessionId, socketId, capabilities) => {
		const entry = ensureSession(sessionId);
		const t = now();
		let viewerEntry = entry.viewers.get(socketId);
		if (!viewerEntry) {
			viewerEntry = { capabilities: null, samples: [] };
			entry.viewers.set(socketId, viewerEntry);
		}
		viewerEntry.capabilities = capabilities;
		const raw = effectiveDownlinkMbit(capabilities);
		if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) {
			viewerEntry.samples.push({ t, mbit: raw });
			trimSamples(viewerEntry.samples, t, historyWindowMs);
		}
		entry.dirty = true;
		return getSummary(sessionId);
	};

	const removeViewer = (sessionId, socketId) => {
		const entry = sessions.get(sessionId);
		if (!entry) return null;
		const removed = entry.viewers.delete(socketId);
		if (!removed) return entry.summary;
		entry.dirty = true;
		if (entry.viewers.size === 0) {
			sessions.delete(sessionId);
			return aggregateEntries([], sessionId, aggregationOptions(now()));
		}
		return getSummary(sessionId);
	};

	const dropSession = (sessionId) => {
		sessions.delete(sessionId);
	};

	const listViewerSnapshots = (sessionId) => {
		const entry = sessions.get(sessionId);
		if (!entry) return [];
		return [...entry.viewers.values()].map((viewer) => viewer.capabilities).filter(Boolean);
	};

	const getViewerSampleCount = (sessionId, socketId) => {
		const entry = sessions.get(sessionId);
		if (!entry) return 0;
		const viewerEntry = entry.viewers.get(socketId);
		if (!viewerEntry) return 0;
		return viewerEntry.samples.length;
	};

	const sessionCount = () => sessions.size;

	return {
		upsertViewer,
		removeViewer,
		getSummary,
		dropSession,
		listViewerSnapshots,
		getViewerSampleCount,
		sessionCount,
	};
};

export {
	createViewerStore,
	aggregateViewers,
	aggregateEntries,
	effectiveDownlinkMbit,
	smoothedEntryDownlinkMbit,
	viewerLoadFraction,
	samplePercentile,
	trimSamples,
	MEDIAN,
	MIN_FINITE,
	MAX_FINITE,
	HISTORY_WINDOW_MS,
	SMOOTHING_PERCENTILE,
	MAX_SAMPLES,
};
