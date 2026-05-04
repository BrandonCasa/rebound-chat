/**
 * IPC bridge between `SourceService` and the renderer.
 *
 * Channels (request → reply over `ipcMain.handle`):
 *   - `sources:list`              → SourceInfo[]
 *   - `sources:cached`            → ThumbnailEvent[]
 *   - `sources:watch`             → starts watching the given ids; returns the
 *                                   subscriptionId you later pass to unwatch.
 *   - `sources:unwatch`           → tears down a subscription created above.
 *   - `sources:capture-once`      → resolves with the next snapshot for one
 *                                   source.
 *
 * Events emitted to every renderer via `webContents.send`:
 *   - `sources:thumbnail`         → ThumbnailEvent
 *   - `sources:error`             → { sourceId, message }
 *
 * Subscription bookkeeping is keyed by the calling `webContents.id` so that
 * a renderer reload tears down its own watches without affecting peers.
 *
 * @typedef {import("./service.js").SourceService} SourceService
 */

import { randomUUID } from "node:crypto";

const CHANNELS = {
	list: "sources:list",
	cached: "sources:cached",
	watch: "sources:watch",
	unwatch: "sources:unwatch",
	captureOnce: "sources:capture-once",
	thumbnail: "sources:thumbnail",
	error: "sources:error",
};

/**
 * @param {Object} options
 * @param {import("electron").IpcMain} options.ipcMain
 * @param {SourceService} options.service
 * @param {(channel: string, payload: unknown) => void} options.broadcast    Emit to every active renderer.
 */
const registerSourceServiceIpc = ({ ipcMain, service, broadcast }) => {
	if (!ipcMain || !service || typeof broadcast !== "function") {
		throw new TypeError("registerSourceServiceIpc requires { ipcMain, service, broadcast }.");
	}

	/** @type {Map<string, { stop: () => void, ownerId: number }>} */
	const subscriptions = new Map();

	const detachThumbnailTap = service.onThumbnail((event) => {
		broadcast(CHANNELS.thumbnail, event);
	});

	ipcMain.handle(CHANNELS.list, async (_event, options) => {
		try {
			return await service.listSources(options);
		} catch (err) {
			broadcast(CHANNELS.error, { sourceId: null, message: err?.message || String(err) });
			throw err;
		}
	});

	ipcMain.handle(CHANNELS.cached, (_event, sourceIds) => {
		return service.getCachedThumbnails(Array.isArray(sourceIds) ? sourceIds : undefined);
	});

	ipcMain.handle(CHANNELS.watch, (event, payload) => {
		const sources = Array.isArray(payload?.sources) ? payload.sources : [];
		if (!sources.length) return null;

		const subscriptionId = randomUUID();
		const stop = service.watch(sources, payload?.options || {});
		subscriptions.set(subscriptionId, { stop, ownerId: event.sender.id });

		event.sender.once("destroyed", () => {
			const entry = subscriptions.get(subscriptionId);
			if (!entry) return;
			subscriptions.delete(subscriptionId);
			try {
				entry.stop();
			} catch (_err) {
				// Already torn down.
			}
		});

		return subscriptionId;
	});

	ipcMain.handle(CHANNELS.unwatch, (_event, subscriptionId) => {
		const entry = subscriptions.get(subscriptionId);
		if (!entry) return false;
		subscriptions.delete(subscriptionId);
		try {
			entry.stop();
		} catch (_err) {
			// Already torn down.
		}
		return true;
	});

	ipcMain.handle(CHANNELS.captureOnce, async (_event, payload) => {
		if (!payload?.source?.id) {
			throw new TypeError("captureOnce requires payload.source.id.");
		}
		return service.captureOnce(payload.source, payload.options || {});
	});

	const dispose = () => {
		ipcMain.removeHandler(CHANNELS.list);
		ipcMain.removeHandler(CHANNELS.cached);
		ipcMain.removeHandler(CHANNELS.watch);
		ipcMain.removeHandler(CHANNELS.unwatch);
		ipcMain.removeHandler(CHANNELS.captureOnce);
		detachThumbnailTap();
		for (const [, entry] of subscriptions) {
			try {
				entry.stop();
			} catch (_err) {
				// Ignore.
			}
		}
		subscriptions.clear();
	};

	return { dispose, channels: CHANNELS };
};

export { registerSourceServiceIpc, CHANNELS };
