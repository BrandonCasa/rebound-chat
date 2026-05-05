/**
 * In-memory store of viewers per live session, keyed by sessionId.
 *
 * The store is intentionally process-local: live streams are tied to a
 * single ingest secret and a single FFmpeg pipeline, so all of a
 * session's viewers fan in to the same node anyway. If/when we
 * horizontally scale the live front-door, swap this for a Redis-backed
 * store of the same shape.
 *
 * Each viewer entry is the latest `ViewerCapabilities` we received for
 * that connection (one per Socket.IO socket). Aggregation is recomputed
 * on every mutation but the result is memoized so listeners don't pay
 * for it more than once between mutations.
 */

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
 * Best-effort downlink for a single viewer. Prefer the HLS-derived
 * estimate (it's measured against actual segment downloads) and fall
 * back to `navigator.connection.downlink`. We never trust either if
 * `saveData` is set — that's a strong user-side hint to keep it small
 * regardless of the link's measured speed.
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

const aggregateViewers = (viewerList, sessionId) => {
	const downlinks = viewerList.map(effectiveDownlinkMbit).filter((value) => typeof value === "number");
	return {
		sessionId,
		viewerCount: viewerList.length,
		minDownlinkMbit: MIN_FINITE(downlinks),
		medianDownlinkMbit: MEDIAN(downlinks),
		supportedCodecs: intersectFamilies(viewerList),
		maxResolution: toMaxResolution(viewerList),
		saveDataCount: viewerList.filter((viewer) => viewer?.network?.saveData).length,
		updatedAt: Date.now(),
	};
};

const createViewerStore = () => {
	const sessions = new Map();

	const ensureSession = (sessionId) => {
		let entry = sessions.get(sessionId);
		if (!entry) {
			entry = {
				viewers: new Map(),
				summary: aggregateViewers([], sessionId),
				dirty: false,
			};
			sessions.set(sessionId, entry);
		}
		return entry;
	};

	const getSummary = (sessionId) => {
		const entry = ensureSession(sessionId);
		if (entry.dirty) {
			entry.summary = aggregateViewers([...entry.viewers.values()], sessionId);
			entry.dirty = false;
		}
		return entry.summary;
	};

	const upsertViewer = (sessionId, socketId, capabilities) => {
		const entry = ensureSession(sessionId);
		entry.viewers.set(socketId, capabilities);
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
			return aggregateViewers([], sessionId);
		}
		return getSummary(sessionId);
	};

	const dropSession = (sessionId) => {
		sessions.delete(sessionId);
	};

	const listViewerSnapshots = (sessionId) => {
		const entry = sessions.get(sessionId);
		if (!entry) return [];
		return [...entry.viewers.values()];
	};

	const sessionCount = () => sessions.size;

	return {
		upsertViewer,
		removeViewer,
		getSummary,
		dropSession,
		listViewerSnapshots,
		sessionCount,
	};
};

export { createViewerStore, aggregateViewers, effectiveDownlinkMbit, MEDIAN, MIN_FINITE };
