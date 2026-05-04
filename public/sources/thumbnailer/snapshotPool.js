/**
 * Long-lived FFmpeg process that snapshots **every** watched source from a
 * single ffmpeg child.
 *
 * One pool == one ffmpeg child. When the watched-source set changes the
 * pool tears down the current child and respawns with a fresh
 * `filter_complex` covering the new set. Adds and removes inside the same
 * tick coalesce via a small debounce window so a "show source picker"
 * gust that registers ten watches doesn't trigger ten respawns.
 *
 * Per-source PNGs are written into the cache dir and replaced atomically
 * (`-update 1 -atomic_writing 1`). A single `fs.watch` on the directory
 * routes file events to the matching source via a pre-built lookup of
 * sanitized filenames. Each emit re-reads the PNG and forwards a
 * `data:image/png;base64,...` payload to the listener.
 *
 * Crash recovery: if ffmpeg exits unexpectedly we wait `restartDelayMs`
 * and respawn with the current set. Repeated rapid failures fan out to
 * `onError` (once per source) so the manager can disable watches instead
 * of looping forever.
 *
 * @typedef {import("../types.js").ThumbnailEvent} ThumbnailEvent
 * @typedef {import("../types.js").ThumbnailRequest} ThumbnailRequest
 * @typedef {import("../types.js").ThumbnailListener} ThumbnailListener
 */

import { spawn } from "node:child_process";
import { rm, readFile, mkdir, stat } from "node:fs/promises";
import { watch } from "node:fs";
import { join } from "node:path";
import { setPriority, constants as osConstants } from "node:os";

import { selectThumbnailBuilder } from "./builders/index.js";

const READ_DEBOUNCE_MS = 200;
const RESPAWN_DEBOUNCE_MS = 150;
const MAX_CONSECUTIVE_FAILURES = 5;
const FAILURE_WINDOW_MS = 30_000;

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const safeStat = async (filePath) => {
	try {
		return await stat(filePath);
	} catch (_err) {
		return null;
	}
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Read the IHDR chunk of a PNG buffer to discover the captured dimensions.
 *
 * @param {Buffer} buf
 * @returns {{ width: number, height: number } | null}
 */
const parsePngDimensions = (buf) => {
	if (!buf || buf.length < 24) return null;
	for (let index = 0; index < PNG_SIGNATURE.length; index += 1) {
		if (buf[index] !== PNG_SIGNATURE[index]) return null;
	}
	return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
};

const sanitizeFilename = (value) =>
	String(value)
		.replace(/[^a-zA-Z0-9._-]+/g, "_")
		.slice(0, 96);

class SnapshotPool {
	/**
	 * @param {Object} options
	 * @param {string} options.cacheDir
	 * @param {string} options.ffmpegPath
	 * @param {NodeJS.Platform} options.platform
	 * @param {ThumbnailListener} options.onThumbnail
	 * @param {(message: string) => void} [options.onLog]
	 * @param {(error: Error, sourceId?: string) => void} [options.onError]
	 * @param {number} [options.restartDelayMs=1000]
	 */
	constructor({ cacheDir, ffmpegPath, platform = process.platform, onThumbnail, onLog, onError, restartDelayMs = 1000 }) {
		if (!cacheDir) throw new TypeError("SnapshotPool requires a cache directory.");
		if (!ffmpegPath) throw new TypeError("SnapshotPool requires an ffmpeg path.");
		if (typeof onThumbnail !== "function") throw new TypeError("SnapshotPool requires an onThumbnail listener.");

		this.cacheDir = cacheDir;
		this.ffmpegPath = ffmpegPath;
		this.platform = platform;
		this.onThumbnail = onThumbnail;
		this.onLog = onLog || (() => {});
		this.onError = onError || (() => {});
		this.restartDelayMs = restartDelayMs;

		/** @type {Map<string, { request: ThumbnailRequest, outputPath: string, lastEmittedAt: number, readTimer: NodeJS.Timeout | null }>} */
		this.entries = new Map();
		/** @type {Map<string, string>} sanitized filename → sourceId for fast watcher dispatch. */
		this.filenameIndex = new Map();

		/** @type {import("node:child_process").ChildProcess | null} */
		this.child = null;
		/** @type {import("node:fs").FSWatcher | null} */
		this.watcher = null;
		this.respawnTimer = null;
		this.starting = false;
		this.disposed = false;
		this.failureTimestamps = [];
		this.stderrBuffer = "";
	}

	/**
	 * Replace the current watched set with `requests`. Triggers a debounced
	 * ffmpeg respawn if the resulting set differs from the running one.
	 *
	 * @param {ThumbnailRequest[]} requests
	 */
	setRequests(requests) {
		if (this.disposed) return;

		const incoming = new Map();
		for (const request of requests || []) {
			if (!request?.source?.id) continue;
			const outputPath = this.outputPathFor(request.source.id);
			incoming.set(request.source.id, { request, outputPath });
		}

		const next = new Map();
		const nextFilenames = new Map();
		for (const [sourceId, { request, outputPath }] of incoming) {
			const existing = this.entries.get(sourceId);
			next.set(sourceId, {
				request,
				outputPath,
				lastEmittedAt: existing?.lastEmittedAt || 0,
				readTimer: existing?.readTimer || null,
			});
			nextFilenames.set(this.filenameFor(sourceId), sourceId);
		}

		const removed = [];
		for (const [sourceId, entry] of this.entries) {
			if (!next.has(sourceId)) {
				if (entry.readTimer) clearTimeout(entry.readTimer);
				removed.push(entry.outputPath);
			}
		}

		this.entries = next;
		this.filenameIndex = nextFilenames;

		void Promise.all(removed.map((path) => rm(path, { force: true }).catch(() => {})));

		this.scheduleRespawn();
	}

	/**
	 * @param {string} sourceId
	 * @returns {string}
	 */
	outputPathFor(sourceId) {
		return join(this.cacheDir, `${sanitizeFilename(sourceId)}.png`);
	}

	/**
	 * @param {string} sourceId
	 * @returns {string}
	 */
	filenameFor(sourceId) {
		return `${sanitizeFilename(sourceId)}.png`;
	}

	scheduleRespawn() {
		if (this.disposed) return;
		if (this.respawnTimer) return;
		this.respawnTimer = setTimeout(() => {
			this.respawnTimer = null;
			void this.respawn();
		}, RESPAWN_DEBOUNCE_MS);
	}

	async respawn() {
		if (this.disposed) return;
		if (this.starting) {
			this.scheduleRespawn();
			return;
		}

		this.starting = true;
		try {
			await this.killChild();

			if (this.entries.size === 0) {
				this.detachWatcher();
				return;
			}

			await mkdir(this.cacheDir, { recursive: true });
			this.attachWatcher();

			const items = Array.from(this.entries.values()).map((entry) => ({ request: entry.request, outputPath: entry.outputPath }));
			const builder = selectThumbnailBuilder(this.platform);
			const args = builder.buildArgs(items);

			this.onLog(`Spawning ffmpeg snapshot pool (${items.length} source${items.length === 1 ? "" : "s"}): ${this.ffmpegPath} ${args.join(" ")}`);

			const child = spawn(this.ffmpegPath, args, {
				windowsHide: true,
				stdio: ["ignore", "ignore", "pipe"],
			});
			this.child = child;
			this.attachLifecycle(child);
			this.bumpPriority(child.pid);
		} catch (err) {
			this.onError(err instanceof Error ? err : new Error(String(err)));
		} finally {
			this.starting = false;
		}
	}

	/**
	 * @param {import("node:child_process").ChildProcess} child
	 */
	attachLifecycle(child) {
		this.stderrBuffer = "";
		child.stderr?.on("data", (chunk) => {
			this.stderrBuffer += chunk.toString();
			if (this.stderrBuffer.length > 4096) {
				this.stderrBuffer = this.stderrBuffer.slice(-4096);
			}
			const lines = this.stderrBuffer.split(/\r?\n/);
			this.stderrBuffer = lines.pop() || "";
			for (const line of lines) {
				const trimmed = line.trim();
				if (trimmed) this.onLog(`ffmpeg[pool]: ${trimmed}`);
			}
		});

		child.once("error", (err) => {
			this.onError(err);
			void this.handleExit(child, null, null);
		});

		child.once("exit", (code, signal) => {
			void this.handleExit(child, code, signal);
		});
	}

	/**
	 * @param {number | undefined} pid
	 */
	bumpPriority(pid) {
		if (!pid) return;
		try {
			setPriority(pid, osConstants.priority?.PRIORITY_ABOVE_NORMAL ?? -10);
		} catch (_err) {
			// Priority is a hint; ignore failures (sandboxed environments, etc.).
		}
	}

	attachWatcher() {
		if (this.watcher || this.disposed) return;
		try {
			this.watcher = watch(this.cacheDir, (_eventType, filename) => {
				if (!filename) return;
				const sourceId = this.filenameIndex.get(filename.toString());
				if (!sourceId) return;
				this.scheduleRead(sourceId);
			});
			this.watcher.on("error", (err) => this.onLog(`watcher error: ${err.message}`));
		} catch (err) {
			this.onLog(`fs.watch unavailable, falling back to interval polling (${err.message})`);
			this.watcher = null;
			this.startFallbackPolling();
		}
	}

	startFallbackPolling() {
		const interval = setInterval(() => {
			for (const sourceId of this.entries.keys()) {
				void this.emitLatest(sourceId);
			}
		}, 1000);
		// Repurpose `this.watcher` as a stoppable handle so detach works uniformly.
		this.watcher = { close: () => clearInterval(interval), on: () => {} };
	}

	detachWatcher() {
		if (!this.watcher) return;
		try {
			this.watcher.close();
		} catch (_err) {
			// Already closed.
		}
		this.watcher = null;
	}

	/**
	 * @param {string} sourceId
	 */
	scheduleRead(sourceId) {
		const entry = this.entries.get(sourceId);
		if (!entry || entry.readTimer) return;
		entry.readTimer = setTimeout(() => {
			entry.readTimer = null;
			void this.emitLatest(sourceId);
		}, READ_DEBOUNCE_MS);
	}

	/**
	 * @param {string} sourceId
	 */
	async emitLatest(sourceId) {
		const entry = this.entries.get(sourceId);
		if (!entry) return;

		const stats = await safeStat(entry.outputPath);
		if (!stats || stats.size === 0) return;
		if (stats.mtimeMs <= entry.lastEmittedAt) return;

		try {
			const data = await readFile(entry.outputPath);
			if (!data.length) return;
			entry.lastEmittedAt = stats.mtimeMs;

			const dimensions = parsePngDimensions(data) || { width: 0, height: 0 };
			this.onThumbnail({
				sourceId,
				dataUrl: `data:image/png;base64,${data.toString("base64")}`,
				width: dimensions.width,
				height: dimensions.height,
				capturedAt: new Date().toISOString(),
			});
		} catch (err) {
			this.onLog(`Failed to read snapshot for ${sourceId}: ${err.message}`);
		}
	}

	/**
	 * @param {import("node:child_process").ChildProcess} child
	 * @param {number | null} code
	 * @param {NodeJS.Signals | null} signal
	 */
	async handleExit(child, code, signal) {
		if (this.child !== child) return;
		this.child = null;

		if (this.disposed) return;
		if (this.entries.size === 0) return;

		const now = Date.now();
		this.failureTimestamps.push(now);
		this.failureTimestamps = this.failureTimestamps.filter((ts) => now - ts < FAILURE_WINDOW_MS);

		this.onLog(`ffmpeg[pool] exited code=${code ?? "null"} signal=${signal ?? "none"}`);

		if (this.failureTimestamps.length >= MAX_CONSECUTIVE_FAILURES) {
			const message = `Snapshot ffmpeg pool failed ${this.failureTimestamps.length} times in ${FAILURE_WINDOW_MS}ms; pausing.`;
			for (const sourceId of this.entries.keys()) {
				this.onError(new Error(message), sourceId);
			}
			await this.dispose();
			return;
		}

		await sleep(this.restartDelayMs);
		if (!this.disposed && this.entries.size > 0) this.scheduleRespawn();
	}

	async killChild() {
		const child = this.child;
		this.child = null;
		if (!child || child.killed) return;

		await new Promise((resolve) => {
			const timeout = setTimeout(() => {
				try {
					child.kill("SIGKILL");
				} catch (_err) {
					// Already dead.
				}
				resolve();
			}, 2000);
			child.once("exit", () => {
				clearTimeout(timeout);
				resolve();
			});
			try {
				child.kill("SIGTERM");
			} catch (_err) {
				clearTimeout(timeout);
				resolve();
			}
		});
	}

	async dispose() {
		if (this.disposed) return;
		this.disposed = true;

		if (this.respawnTimer) {
			clearTimeout(this.respawnTimer);
			this.respawnTimer = null;
		}
		for (const entry of this.entries.values()) {
			if (entry.readTimer) clearTimeout(entry.readTimer);
		}

		const cleanupPaths = Array.from(this.entries.values()).map((entry) => entry.outputPath);
		this.entries.clear();
		this.filenameIndex.clear();

		await this.killChild();
		this.detachWatcher();
		await Promise.all(cleanupPaths.map((path) => rm(path, { force: true }).catch(() => {})));
	}
}

export { SnapshotPool, parsePngDimensions };
