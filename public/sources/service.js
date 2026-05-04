/**
 * High-level façade over the enumerator + thumbnail manager.
 *
 * The renderer (and any future feature inside Electron) talks to a single
 * `SourceService` instance. Concrete responsibilities split as follows:
 *   - `listSources`            — proxy to the platform enumerator
 *   - `watch` / `captureOnce`  — proxy to the `ThumbnailManager`
 *   - `getCachedThumbnails`    — pulls the latest snapshot of the cache
 *
 * Lifecycle is explicit: callers run `await service.start()` after FFmpeg
 * paths have been resolved and `await service.stop()` from `before-quit`.
 * Calls before `start()` throw, so wiring problems surface immediately.
 *
 * @typedef {import("./types.js").SourceInfo} SourceInfo
 * @typedef {import("./types.js").ThumbnailEvent} ThumbnailEvent
 * @typedef {import("./types.js").EnumeratorOptions} EnumeratorOptions
 * @typedef {import("./types.js").ThumbnailListener} ThumbnailListener
 */

import { mkdir, rm } from "node:fs/promises";

import { selectEnumerator } from "./enumerator/index.js";
import { ThumbnailManager } from "./thumbnailer/index.js";
import { ThumbnailCache } from "./cache.js";

class SourceService {
	/**
	 * @param {Object} options
	 * @param {string} options.ffmpegPath
	 * @param {string} options.cacheDir       Filesystem location for the snapshot scratch files.
	 * @param {NodeJS.Platform} [options.platform]
	 * @param {(event: ThumbnailEvent) => void} [options.onThumbnail]   Optional global tap (in addition to per-watcher callbacks).
	 * @param {(message: string) => void} [options.onLog]
	 * @param {(error: Error, sourceId?: string) => void} [options.onError]
	 * @param {{ intervalMs?: number, scale?: number, cacheCapacity?: number }} [options.defaults]
	 */
	constructor({ ffmpegPath, cacheDir, platform = process.platform, onThumbnail, onLog, onError, defaults = {} }) {
		if (!ffmpegPath) throw new TypeError("SourceService requires an ffmpegPath.");
		if (!cacheDir) throw new TypeError("SourceService requires a cacheDir.");

		this.ffmpegPath = ffmpegPath;
		this.cacheDir = cacheDir;
		this.platform = platform;
		this.onThumbnailTap = onThumbnail || null;
		this.onLog = onLog || (() => {});
		this.onError = onError || (() => {});

		this.enumerator = selectEnumerator(platform);
		this.cache = new ThumbnailCache({ capacity: defaults.cacheCapacity });
		/** @type {Set<ThumbnailListener>} */
		this.listeners = new Set();

		this.manager = new ThumbnailManager({
			cacheDir,
			ffmpegPath,
			platform,
			onThumbnail: (event) => this.handleThumbnail(event),
			onLog: this.onLog,
			onError: this.onError,
			defaults,
		});

		this.started = false;
		this.stopped = false;
	}

	/**
	 * Allocate the cache directory and mark the service as ready.
	 */
	async start() {
		if (this.started) return;
		await mkdir(this.cacheDir, { recursive: true });
		this.started = true;
		this.onLog(`SourceService ready (platform=${this.platform}, cacheDir=${this.cacheDir})`);
	}

	/**
	 * Tear down every snapshot process and remove the cache directory.
	 */
	async stop() {
		if (!this.started || this.stopped) return;
		this.stopped = true;
		this.listeners.clear();
		await this.manager.dispose();
		await rm(this.cacheDir, { recursive: true, force: true }).catch(() => {});
		this.onLog("SourceService stopped");
	}

	assertReady() {
		if (!this.started) throw new Error("SourceService.start() must be awaited before use.");
		if (this.stopped) throw new Error("SourceService has already been stopped.");
	}

	/**
	 * @param {EnumeratorOptions} [options]
	 * @returns {Promise<SourceInfo[]>}
	 */
	async listSources(options) {
		this.assertReady();
		return this.enumerator.enumerate(options);
	}

	/**
	 * Subscribe to thumbnails. The optional `sourceIds` filter only forwards
	 * events that match the given ids; omit it to receive every event.
	 *
	 * @param {ThumbnailListener} listener
	 * @param {string[]} [sourceIds]
	 * @returns {() => void}
	 */
	onThumbnail(listener, sourceIds) {
		if (typeof listener !== "function") throw new TypeError("onThumbnail listener must be a function.");
		const filterSet = sourceIds && sourceIds.length ? new Set(sourceIds) : null;
		const wrapper = (event) => {
			if (!filterSet || filterSet.has(event.sourceId)) listener(event);
		};
		this.listeners.add(wrapper);
		return () => this.listeners.delete(wrapper);
	}

	/**
	 * Begin watching the given source ids. Returns an unsubscribe function
	 * that releases every reference taken by this call.
	 *
	 * @param {SourceInfo[]} sources
	 * @param {{ intervalMs?: number, scale?: number }} [options]
	 * @returns {() => void}
	 */
	watch(sources, options) {
		this.assertReady();
		const stops = sources.map((source) => this.manager.watch(source, options));
		return () => {
			for (const stop of stops) stop();
		};
	}

	/**
	 * @param {string[]} [sourceIds]
	 * @returns {ThumbnailEvent[]}
	 */
	getCachedThumbnails(sourceIds) {
		this.assertReady();
		return this.cache.snapshot(sourceIds);
	}

	/**
	 * One-shot capture: subscribes briefly, awaits the next snapshot, and
	 * cleans up. Useful for "show this in a tooltip" style requests.
	 *
	 * @param {SourceInfo} source
	 * @param {{ intervalMs?: number, scale?: number, timeoutMs?: number }} [options]
	 * @returns {Promise<ThumbnailEvent>}
	 */
	captureOnce(source, options = {}) {
		this.assertReady();
		const timeoutMs = options.timeoutMs || 10_000;

		return new Promise((resolve, reject) => {
			let unsubscribe = () => {};
			let stopWatch = () => {};
			let timer = null;

			const cleanup = () => {
				clearTimeout(timer);
				unsubscribe();
				stopWatch();
			};

			unsubscribe = this.onThumbnail(
				(event) => {
					cleanup();
					resolve(event);
				},
				[source.id]
			);

			try {
				stopWatch = this.watch([source], options);
			} catch (err) {
				cleanup();
				reject(err);
				return;
			}

			timer = setTimeout(() => {
				cleanup();
				reject(new Error(`Timed out after ${timeoutMs}ms waiting for a thumbnail of ${source.id}.`));
			}, timeoutMs);
		});
	}

	/**
	 * @param {ThumbnailEvent} event
	 */
	handleThumbnail(event) {
		const changed = this.cache.set(event);
		if (this.onThumbnailTap) this.onThumbnailTap(event);
		if (!changed) return;
		for (const listener of this.listeners) {
			try {
				listener(event);
			} catch (err) {
				this.onError(err instanceof Error ? err : new Error(String(err)), event.sourceId);
			}
		}
	}
}

export { SourceService };
