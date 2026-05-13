/**
 * Façade over Electron's `desktopCapturer` for the renderer.
 *
 * Replaces the previous FFmpeg snapshot pool. `desktopCapturer.getSources`
 * already returns a `NativeImage` thumbnail for every source it lists, so
 * one call enumerates and snapshots in a single round trip — no scratch
 * directory, no child process, no per-source filter graphs.
 *
 * Lifecycle:
 *   - `listSources` is a one-shot enumeration the renderer uses to
 *     populate the source picker.
 *   - `watch(sources)` ref-counts a set of source ids. While anything is
 *     watched, a single shared poll fires every `intervalMs` and emits a
 *     `ThumbnailEvent` for each watched source present in the response.
 *     Unwatch drops one ref; when refs hit zero the poll stops.
 *   - `captureOnce` waits for the next poll tick (kicking one immediately
 *     if needed) and resolves with the first matching event.
 *
 * The cache de-dupes identical `dataUrl`s so the renderer only repaints
 * when the picture actually changed.
 *
 * @typedef {import("./types.js").SourceInfo} SourceInfo
 * @typedef {import("./types.js").ThumbnailEvent} ThumbnailEvent
 * @typedef {import("./types.js").EnumeratorOptions} EnumeratorOptions
 * @typedef {import("./types.js").ThumbnailListener} ThumbnailListener
 */

import { ThumbnailCache } from "./cache.js";

const DEFAULT_INTERVAL_MS = 1000;
const DEFAULT_THUMBNAIL_SIZE = { width: 1280, height: 720 };
const DEFAULT_JPEG_QUALITY = 82;
const ALLOWED_TYPES = new Set(["screen", "window"]);

const normalizeTypes = (types) => {
	if (!Array.isArray(types) || !types.length) return ["screen", "window"];
	const filtered = types.filter((type) => ALLOWED_TYPES.has(type));
	return filtered.length ? filtered : ["screen", "window"];
};

const normalizeSize = (size, fallback) => {
	const width = Number.parseInt(size?.width, 10);
	const height = Number.parseInt(size?.height, 10);
	return {
		width: Number.isFinite(width) && width > 0 ? width : fallback.width,
		height: Number.isFinite(height) && height > 0 ? height : fallback.height,
	};
};

/**
 * Encode a NativeImage thumbnail as a data URL. JPEG is preferred because
 * desktop captures are photographic content, where a quality≈82 JPEG is
 * typically 5-20x smaller than a PNG and significantly faster to encode —
 * the encode and the IPC serialization were the dominant costs of the old
 * PNG path. Falls back to PNG via `toDataURL()` when `toJPEG` is missing
 * (e.g. in unit tests or older Electron builds).
 *
 * @param {{ toJPEG?: (quality: number) => Buffer | Uint8Array, toDataURL?: () => string } | null | undefined} image
 * @param {number} [quality]
 * @returns {string}
 */
const thumbnailToDataUrl = (image, quality = DEFAULT_JPEG_QUALITY) => {
	if (!image) return "";
	if (typeof image.toJPEG === "function") {
		try {
			const buffer = image.toJPEG(quality);
			if (buffer && typeof buffer.toString === "function") {
				const base64 = buffer.toString("base64");
				if (base64) return `data:image/jpeg;base64,${base64}`;
			}
		} catch (_err) {
			// Some platforms (e.g. transparent windows on Linux) can fail JPEG
			// encoding; fall through to the PNG path below.
		}
	}
	if (typeof image.toDataURL === "function") {
		return image.toDataURL();
	}
	return "";
};

/**
 * @param {{ id: string, name: string, display_id?: string, thumbnail?: { toDataURL?: () => string, getSize?: () => { width: number, height: number } }, appIcon?: { toDataURL?: () => string } }} source
 * @returns {SourceInfo & { thumbnail?: string, thumbnailSize?: { width: number, height: number }, appIcon?: string }}
 */
const serializeSource = (source) => {
	const id = String(source?.id || "");
	const name = String(source?.name || "");
	const kind = id.startsWith("screen") ? "screen" : "window";
	const displayId = source?.display_id ? String(source.display_id) : "";
	const thumbnail = thumbnailToDataUrl(source?.thumbnail);
	const sizeFn = typeof source?.thumbnail?.getSize === "function" ? source.thumbnail.getSize() : null;
	const appIcon = typeof source?.appIcon?.toDataURL === "function" ? source.appIcon.toDataURL() : "";
	return {
		id,
		name,
		kind,
		displayId: displayId || undefined,
		thumbnail: thumbnail || undefined,
		thumbnailSize: sizeFn ? { width: Number(sizeFn.width) || 0, height: Number(sizeFn.height) || 0 } : undefined,
		appIcon: appIcon || undefined,
	};
};

class SourceService {
	/**
	 * @param {Object} options
	 * @param {{ getSources: (opts: { types: string[], thumbnailSize?: { width: number, height: number }, fetchWindowIcons?: boolean }) => Promise<Array<unknown>> }} options.desktopCapturer
	 * @param {(message: string) => void} [options.onLog]
	 * @param {(error: Error, sourceId?: string) => void} [options.onError]
	 * @param {{ intervalMs?: number, thumbnailSize?: { width: number, height: number }, cacheCapacity?: number, fetchWindowIcons?: boolean }} [options.defaults]
	 */
	constructor({ desktopCapturer, onLog, onError, defaults = {} }) {
		if (!desktopCapturer || typeof desktopCapturer.getSources !== "function") {
			throw new TypeError("SourceService requires Electron's desktopCapturer module.");
		}

		this.desktopCapturer = desktopCapturer;
		this.onLog = onLog || (() => {});
		this.onError = onError || ((err) => this.onLog(`SourceService error: ${err?.message || err}`));
		this.defaults = {
			intervalMs: Number.isFinite(defaults.intervalMs) && defaults.intervalMs > 0 ? defaults.intervalMs : DEFAULT_INTERVAL_MS,
			thumbnailSize: normalizeSize(defaults.thumbnailSize, DEFAULT_THUMBNAIL_SIZE),
			fetchWindowIcons: Boolean(defaults.fetchWindowIcons),
		};

		this.cache = new ThumbnailCache({ capacity: defaults.cacheCapacity });

		/** @type {Map<string, number>} watched source id → reference count. */
		this.subscriptions = new Map();
		/** @type {Set<ThumbnailListener>} */
		this.listeners = new Set();

		this.pollTimer = null;
		this.pollInFlight = false;
		/** @type {Array<{ resolve: () => void, reject: (err: Error) => void }>} */
		this.pendingTickWaiters = [];

		this.started = false;
		this.stopped = false;
	}

	async start() {
		if (this.started) return;
		this.started = true;
		this.onLog(`SourceService ready (interval=${this.defaults.intervalMs}ms)`);
	}

	async stop() {
		if (!this.started || this.stopped) return;
		this.stopped = true;
		this.stopPollLoop();
		this.subscriptions.clear();
		this.listeners.clear();
		this.cache.clear();
		const waiters = this.pendingTickWaiters.splice(0);
		for (const waiter of waiters) {
			waiter.reject(new Error("SourceService was stopped before the next poll completed."));
		}
		this.onLog("SourceService stopped");
	}

	assertReady() {
		if (!this.started) throw new Error("SourceService.start() must be awaited before use.");
		if (this.stopped) throw new Error("SourceService has already been stopped.");
	}

	/**
	 * @param {EnumeratorOptions & { thumbnailSize?: { width: number, height: number }, fetchWindowIcons?: boolean }} [options]
	 * @returns {Promise<SourceInfo[]>}
	 */
	async listSources(options = {}) {
		this.assertReady();
		const sources = await this.fetchSources(options);
		return sources.map(serializeSource);
	}

	/**
	 * Internal helper that calls `desktopCapturer.getSources` with normalized
	 * options. Used by both `listSources` and the polling loop so both honor
	 * the same defaults.
	 *
	 * @param {{ types?: string[], thumbnailSize?: { width: number, height: number }, fetchWindowIcons?: boolean }} options
	 */
	async fetchSources(options = {}) {
		const types = normalizeTypes(options.types);
		const thumbnailSize = normalizeSize(options.thumbnailSize, this.defaults.thumbnailSize);
		const fetchWindowIcons = options.fetchWindowIcons ?? this.defaults.fetchWindowIcons;
		return this.desktopCapturer.getSources({
			types,
			thumbnailSize,
			fetchWindowIcons,
		});
	}

	/**
	 * Subscribe to thumbnail events. The optional `sourceIds` filter only
	 * forwards events whose id matches; omit it to receive every event.
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
	 * Begin watching the given sources. Returns an unsubscribe function that
	 * releases every reference taken by this call. The poll loop runs as
	 * long as at least one source is watched.
	 *
	 * @param {SourceInfo[]} sources
	 * @returns {() => void}
	 */
	watch(sources) {
		this.assertReady();
		const ids = (Array.isArray(sources) ? sources : []).map((source) => source?.id).filter(Boolean);
		for (const id of ids) {
			this.subscriptions.set(id, (this.subscriptions.get(id) || 0) + 1);
		}
		if (this.subscriptions.size > 0) this.startPollLoop();

		let released = false;
		return () => {
			if (released) return;
			released = true;
			for (const id of ids) {
				const next = (this.subscriptions.get(id) || 0) - 1;
				if (next <= 0) {
					this.subscriptions.delete(id);
					this.cache.delete(id);
				} else {
					this.subscriptions.set(id, next);
				}
			}
			if (this.subscriptions.size === 0) this.stopPollLoop();
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
	 * Ad-hoc capture: subscribe briefly, await the next snapshot, and clean
	 * up. Useful for "show this in a tooltip" style requests.
	 *
	 * @param {SourceInfo} source
	 * @param {{ timeoutMs?: number }} [options]
	 * @returns {Promise<ThumbnailEvent>}
	 */
	captureOnce(source, options = {}) {
		this.assertReady();
		if (!source?.id) {
			return Promise.reject(new TypeError("captureOnce requires a source with an id."));
		}
		const timeoutMs = Number.isFinite(options.timeoutMs) && options.timeoutMs > 0 ? options.timeoutMs : 10_000;

		return new Promise((resolve, reject) => {
			let stopWatch = () => {};
			let unsubscribe = () => {};
			let timer = null;

			const cleanup = () => {
				if (timer) clearTimeout(timer);
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
				stopWatch = this.watch([source]);
			} catch (err) {
				cleanup();
				reject(err);
				return;
			}

			void this.pollOnce().catch((err) => this.onLog(`captureOnce poll kick failed: ${err.message}`));

			timer = setTimeout(() => {
				cleanup();
				reject(new Error(`Timed out after ${timeoutMs}ms waiting for a thumbnail of ${source.id}.`));
			}, timeoutMs);
		});
	}

	startPollLoop() {
		if (this.pollTimer || this.stopped) return;
		void this.pollOnce().catch((err) => this.onLog(`Initial poll failed: ${err.message}`));
		this.pollTimer = setInterval(() => {
			void this.pollOnce().catch((err) => this.onLog(`Poll failed: ${err.message}`));
		}, this.defaults.intervalMs);
		if (typeof this.pollTimer?.unref === "function") this.pollTimer.unref();
	}

	stopPollLoop() {
		if (!this.pollTimer) return;
		clearInterval(this.pollTimer);
		this.pollTimer = null;
	}

	/**
	 * Run a single enumeration cycle. Coalesces overlapping invocations so a
	 * `captureOnce` kick during an in-flight poll just waits for the result
	 * instead of doubling the load on `desktopCapturer`.
	 */
	async pollOnce() {
		if (this.subscriptions.size === 0 || this.stopped) return;
		if (this.pollInFlight) {
			await new Promise((resolve, reject) => {
				this.pendingTickWaiters.push({ resolve, reject });
			});
			return;
		}

		this.pollInFlight = true;
		try {
			const sources = await this.fetchSources();
			if (this.stopped) return;
			const capturedAt = new Date().toISOString();
			for (const raw of sources) {
				const id = String(raw?.id || "");
				if (!this.subscriptions.has(id)) continue;
				const dataUrl = thumbnailToDataUrl(raw?.thumbnail);
				if (!dataUrl) continue;
				const size = typeof raw?.thumbnail?.getSize === "function" ? raw.thumbnail.getSize() : null;
				const event = {
					sourceId: id,
					dataUrl,
					width: Number(size?.width) || 0,
					height: Number(size?.height) || 0,
					capturedAt,
				};
				this.emitThumbnail(event);
			}
		} catch (err) {
			const error = err instanceof Error ? err : new Error(String(err));
			this.onError(error);
		} finally {
			this.pollInFlight = false;
			const waiters = this.pendingTickWaiters.splice(0);
			for (const waiter of waiters) waiter.resolve();
		}
	}

	/**
	 * @param {ThumbnailEvent} event
	 */
	emitThumbnail(event) {
		const changed = this.cache.set(event);
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

export { SourceService, serializeSource, thumbnailToDataUrl, DEFAULT_INTERVAL_MS, DEFAULT_THUMBNAIL_SIZE, DEFAULT_JPEG_QUALITY };
