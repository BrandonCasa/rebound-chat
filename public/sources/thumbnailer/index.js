/**
 * Thumbnail manager: hands a single shared `SnapshotPool` the current set of
 * watched sources and reference-counts subscribers per source id.
 *
 * Multiple callers can `watch(id)` the same source; the pool only ever runs
 * one ffmpeg child total, regardless of how many sources are being watched
 * — adding or removing a source updates the pool's filter chain. The pool
 * stays alive across set changes; `dispose()` (called from the app
 * shutdown hook) is what actually tears the ffmpeg child down.
 *
 * The manager intentionally does no UI work — it accepts `SourceInfo`
 * descriptors and emits `ThumbnailEvent`s. The IPC bridge wraps these
 * primitives for the renderer.
 *
 * @typedef {import("../types.js").SourceInfo} SourceInfo
 * @typedef {import("../types.js").ThumbnailEvent} ThumbnailEvent
 * @typedef {import("../types.js").ThumbnailListener} ThumbnailListener
 */

import { SnapshotPool } from "./snapshotPool.js";

const DEFAULT_INTERVAL_MS = 1000;
const DEFAULT_SCALE = 0.5;

class ThumbnailManager {
	/**
	 * @param {Object} options
	 * @param {string} options.cacheDir
	 * @param {string} options.ffmpegPath
	 * @param {NodeJS.Platform} options.platform
	 * @param {(event: ThumbnailEvent) => void} options.onThumbnail
	 * @param {(message: string) => void} [options.onLog]
	 * @param {(error: Error, sourceId: string) => void} [options.onError]
	 * @param {{ intervalMs?: number, scale?: number }} [options.defaults]
	 */
	constructor({ cacheDir, ffmpegPath, platform = process.platform, onThumbnail, onLog, onError, defaults = {} }) {
		if (!cacheDir) throw new TypeError("ThumbnailManager requires a cacheDir.");
		if (!ffmpegPath) throw new TypeError("ThumbnailManager requires an ffmpegPath.");
		if (typeof onThumbnail !== "function") throw new TypeError("ThumbnailManager requires an onThumbnail listener.");

		this.cacheDir = cacheDir;
		this.ffmpegPath = ffmpegPath;
		this.platform = platform;
		this.onThumbnail = onThumbnail;
		this.onLog = onLog || (() => {});
		this.onError = onError || (() => {});
		this.defaults = {
			intervalMs: defaults.intervalMs || DEFAULT_INTERVAL_MS,
			scale: defaults.scale || DEFAULT_SCALE,
		};

		/** @type {Map<string, { request: import("../types.js").ThumbnailRequest, subscribers: number, source: SourceInfo }>} */
		this.entries = new Map();
		this.disposed = false;

		this.pool = new SnapshotPool({
			cacheDir,
			ffmpegPath,
			platform,
			onThumbnail: (event) => this.onThumbnail(event),
			onLog: (message) => this.onLog(message),
			onError: (err, sourceId) => this.onError(err, sourceId),
		});
	}

	/**
	 * Begin watching the given source. Returns an unsubscribe function whose
	 * call removes one reference; the source is removed from the shared
	 * ffmpeg pool when the reference count hits zero.
	 *
	 * @param {SourceInfo} source
	 * @param {{ intervalMs?: number, scale?: number }} [options]
	 * @returns {() => void}
	 */
	watch(source, options = {}) {
		if (this.disposed) throw new Error("ThumbnailManager has been disposed.");
		if (!source?.id) throw new TypeError("watch() requires a source with an id.");

		const existing = this.entries.get(source.id);
		if (existing) {
			existing.subscribers += 1;
			return () => this.unwatch(source.id);
		}

		const request = {
			sourceId: source.id,
			source,
			intervalMs: options.intervalMs || this.defaults.intervalMs,
			scale: options.scale || this.defaults.scale,
		};

		this.entries.set(source.id, { request, subscribers: 1, source });
		this.syncPool();

		return () => this.unwatch(source.id);
	}

	/**
	 * @param {string} sourceId
	 */
	unwatch(sourceId) {
		const entry = this.entries.get(sourceId);
		if (!entry) return;
		entry.subscribers -= 1;
		if (entry.subscribers > 0) return;
		this.entries.delete(sourceId);
		this.syncPool();
	}

	syncPool() {
		const requests = Array.from(this.entries.values()).map((entry) => entry.request);
		this.pool.setRequests(requests);
	}

	/**
	 * @returns {string[]}
	 */
	watchedIds() {
		return Array.from(this.entries.keys());
	}

	async dispose() {
		if (this.disposed) return;
		this.disposed = true;
		this.entries.clear();
		await this.pool.dispose();
	}
}

export { ThumbnailManager, DEFAULT_INTERVAL_MS, DEFAULT_SCALE };
