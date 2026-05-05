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
 * Crash recovery uses a two-tier circuit breaker:
 *
 *   1. **Per-source quarantine.** ffmpeg's `filter_complex` is
 *      all-or-nothing: a single misbehaving source (e.g. a system-tray
 *      helper window without a capture surface) kills the entire graph
 *      at config time and would otherwise poison every other thumbnail.
 *      The pool watches stderr for builder-attributed failures, marks
 *      the offending source as quarantined with exponential backoff, and
 *      respawns ffmpeg without it. Each quarantine fires `onError` once
 *      so the renderer can degrade gracefully (e.g. show a placeholder).
 *      Healthy sources continue updating throughout.
 *
 *   2. **Global pool brake.** Truly unattributable exits (binary
 *      missing, OOM, etc.) still count toward `MAX_CONSECUTIVE_FAILURES`;
 *      after enough of them in `FAILURE_WINDOW_MS` the pool disposes
 *      itself rather than spinning. This is the original safety net.
 *
 * Quarantined sources stay in `entries` so they're retried automatically
 * once their backoff expires (half-open). Repeated failures grow the
 * backoff up to `QUARANTINE_MAX_MS`. Removing a source from the
 * watched set clears any quarantine state for it.
 *
 * To avoid disturbing healthy thumbnails, recovery is gated by an
 * out-of-band **probe**: when a quarantine expires the pool spawns a
 * one-shot single-source ffmpeg (via `builder.buildProbePlan`) targeting
 * just the offender. The main pool keeps streaming all the healthy
 * sources during the probe. Only on probe success does the pool force a
 * main respawn that re-includes the recovered source — so the cost of
 * "is the bad window alive yet?" is paid by a 2nd ffmpeg, not by
 * tearing down the N-1 working captures every backoff window. Builders
 * without `buildProbePlan` fall back to the original behaviour
 * (respawn the main pool to retry).
 *
 * @typedef {import("../types.js").ThumbnailEvent} ThumbnailEvent
 * @typedef {import("../types.js").ThumbnailRequest} ThumbnailRequest
 * @typedef {import("../types.js").ThumbnailListener} ThumbnailListener
 * @typedef {{ argv: string[], identifyFailures: (line: string) => string[] }} BuilderPlan
 */

import { spawn as defaultSpawn } from "node:child_process";
import { rm, readFile, mkdir, stat } from "node:fs/promises";
import { watch } from "node:fs";
import { join } from "node:path";
import { setPriority, constants as osConstants } from "node:os";

import { selectThumbnailBuilder } from "./builders/index.js";

const READ_DEBOUNCE_MS = 200;
const RESPAWN_DEBOUNCE_MS = 150;
const MAX_CONSECUTIVE_FAILURES = 5;
const FAILURE_WINDOW_MS = 30_000;
const QUARANTINE_BASE_MS = 5_000;
const QUARANTINE_MAX_MS = 5 * 60_000;
const QUARANTINE_BACKOFF_FACTOR = 2;

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

/**
 * @param {BuilderPlan | { argv: string[] } | string[]} planOrArgs
 * @returns {BuilderPlan}
 */
const normalizePlan = (planOrArgs) => {
	if (Array.isArray(planOrArgs)) return { argv: planOrArgs, identifyFailures: () => [] };
	if (planOrArgs && Array.isArray(planOrArgs.argv)) {
		return {
			argv: planOrArgs.argv,
			identifyFailures: typeof planOrArgs.identifyFailures === "function" ? planOrArgs.identifyFailures : () => [],
		};
	}
	throw new TypeError("SnapshotPool builder must return either an argv array or a { argv, identifyFailures } plan.");
};

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
	 * @param {typeof defaultSpawn} [options.spawn] Injectable for tests.
	 * @param {{ buildPlan?: Function, buildArgs?: Function }} [options.builder] Injectable for tests; defaults to the platform builder.
	 */
	constructor({ cacheDir, ffmpegPath, platform = process.platform, onThumbnail, onLog, onError, restartDelayMs = 1000, spawn = defaultSpawn, builder }) {
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
		this.spawn = spawn;
		this.builder = builder || selectThumbnailBuilder(platform);

		/** @type {Map<string, { request: ThumbnailRequest, outputPath: string, lastEmittedAt: number, readTimer: NodeJS.Timeout | null }>} */
		this.entries = new Map();
		/** @type {Map<string, string>} sanitized filename → sourceId for fast watcher dispatch. */
		this.filenameIndex = new Map();
		/**
		 * Sources whose last spawn participation failed at filter-graph
		 * config time. They're excluded from respawn until `until`, then
		 * automatically retried (half-open). Repeated failures grow the
		 * backoff up to `QUARANTINE_MAX_MS`.
		 *
		 * @type {Map<string, { until: number, attempts: number, reason: string }>}
		 */
		this.quarantine = new Map();
		/** @type {Set<string>} blamed sources for the in-flight ffmpeg child. */
		this.currentSpawnBlame = new Set();
		/** @type {BuilderPlan | null} plan that produced the in-flight ffmpeg child. */
		this.currentSpawnPlan = null;
		/** @type {Set<string>} sources included in the in-flight ffmpeg child. */
		this.currentSpawnSourceIds = new Set();

		/** @type {import("node:child_process").ChildProcess | null} */
		this.child = null;
		/** @type {import("node:fs").FSWatcher | null} */
		this.watcher = null;
		this.respawnTimer = null;
		this.quarantineRetryTimer = null;
		this.starting = false;
		this.disposed = false;
		this.failureTimestamps = [];
		this.stderrBuffer = "";

		/**
		 * In-flight quarantine probe (if any). Probes are intentionally
		 * serialised — at most one source is probed at a time — to keep
		 * the recovery path cheap and predictable.
		 *
		 * @type {{ child: import("node:child_process").ChildProcess, sourceId: string, plan: BuilderPlan, blamed: Set<string>, stderrBuffer: string, outputPath: string, exited: boolean } | null}
		 */
		this.probe = null;
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
				this.quarantine.delete(sourceId);
			}
		}

		this.entries = next;
		this.filenameIndex = nextFilenames;

		// If the source currently being probed is no longer watched,
		// abort the probe so we don't spawn a respawn for a stale id.
		if (this.probe && !this.entries.has(this.probe.sourceId)) {
			void this.killProbe();
		}

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

	/**
	 * Build the list of items eligible for the next spawn by filtering out
	 * any source whose quarantine hasn't expired yet.
	 *
	 * @returns {Array<{ request: ThumbnailRequest, outputPath: string, sourceId: string }>}
	 */
	activeItems() {
		const now = Date.now();
		const items = [];
		for (const [sourceId, entry] of this.entries) {
			const q = this.quarantine.get(sourceId);
			if (q && q.until > now) continue;
			items.push({ request: entry.request, outputPath: entry.outputPath, sourceId });
		}
		return items;
	}

	scheduleQuarantineRetry() {
		if (this.disposed) return;
		if (this.quarantineRetryTimer) {
			clearTimeout(this.quarantineRetryTimer);
			this.quarantineRetryTimer = null;
		}
		if (this.quarantine.size === 0) return;
		const now = Date.now();
		let nextAt = Infinity;
		for (const q of this.quarantine.values()) {
			if (q.until < nextAt) nextAt = q.until;
		}
		const delay = Math.max(0, nextAt - now) + 50;
		this.quarantineRetryTimer = setTimeout(() => {
			this.quarantineRetryTimer = null;
			void this.runQuarantineRetry();
		}, delay);
	}

	/**
	 * Pick the next quarantined source whose backoff has expired and
	 * either probe it (if the builder supports it) or fall back to a
	 * full respawn (legacy path for builders that can't probe in
	 * isolation).
	 */
	async runQuarantineRetry() {
		if (this.disposed) return;
		if (this.probe) return; // Probe in flight; new one will be scheduled on its exit.
		if (this.entries.size === 0) return;

		const now = Date.now();
		let candidateId = null;
		let candidateEntry = null;
		for (const [sourceId, q] of this.quarantine) {
			if (q.until > now) continue;
			const entry = this.entries.get(sourceId);
			if (!entry) {
				this.quarantine.delete(sourceId);
				continue;
			}
			candidateId = sourceId;
			candidateEntry = entry;
			break;
		}

		if (!candidateId) {
			this.scheduleQuarantineRetry();
			return;
		}

		// Builders without a probe path keep the old all-or-nothing
		// retry behaviour: respawn the main pool with the candidate
		// re-included and let the existing blame plumbing re-quarantine
		// it on failure.
		if (typeof this.builder.buildProbePlan !== "function") {
			this.scheduleRespawn();
			return;
		}

		await this.startProbe(candidateId, candidateEntry);
	}

	/**
	 * @param {string} sourceId
	 * @param {{ request: ThumbnailRequest, outputPath: string }} entry
	 */
	async startProbe(sourceId, entry) {
		if (this.disposed || this.probe) return;

		let plan;
		try {
			plan = normalizePlan(this.builder.buildProbePlan({ request: entry.request, outputPath: `${entry.outputPath}.probe` }));
		} catch (err) {
			this.onError(err instanceof Error ? err : new Error(String(err)), sourceId);
			this.scheduleQuarantineRetry();
			return;
		}

		try {
			await mkdir(this.cacheDir, { recursive: true });
		} catch (err) {
			this.onLog(`Probe mkdir failed for ${sourceId}: ${err.message}`);
			this.scheduleQuarantineRetry();
			return;
		}

		this.onLog(`Probing quarantined source ${sourceId}: ${this.ffmpegPath} ${plan.argv.join(" ")}`);

		let child;
		try {
			child = this.spawn(this.ffmpegPath, plan.argv, {
				windowsHide: true,
				stdio: ["ignore", "ignore", "pipe"],
			});
		} catch (err) {
			this.onError(err instanceof Error ? err : new Error(String(err)), sourceId);
			this.quarantineSources([sourceId]);
			this.scheduleQuarantineRetry();
			return;
		}

		const probe = {
			child,
			sourceId,
			plan,
			blamed: new Set(),
			stderrBuffer: "",
			outputPath: `${entry.outputPath}.probe`,
			exited: false,
		};
		this.probe = probe;
		this.attachProbeLifecycle(probe);
	}

	/**
	 * @param {{ child: import("node:child_process").ChildProcess, sourceId: string, plan: BuilderPlan, blamed: Set<string>, stderrBuffer: string, outputPath: string, exited: boolean }} probe
	 */
	attachProbeLifecycle(probe) {
		probe.child.stderr?.on("data", (chunk) => {
			probe.stderrBuffer += chunk.toString();
			if (probe.stderrBuffer.length > 4096) {
				probe.stderrBuffer = probe.stderrBuffer.slice(-4096);
			}
			const lines = probe.stderrBuffer.split(/\r?\n/);
			probe.stderrBuffer = lines.pop() || "";
			for (const line of lines) {
				const trimmed = line.trim();
				if (!trimmed) continue;
				this.onLog(`ffmpeg[probe ${probe.sourceId}]: ${trimmed}`);
				const blamed = probe.plan.identifyFailures(trimmed);
				for (const id of blamed) {
					if (id === probe.sourceId) probe.blamed.add(id);
				}
			}
		});

		probe.child.once("error", (err) => {
			this.onError(err, probe.sourceId);
			void this.handleProbeExit(probe, null, null);
		});

		probe.child.once("exit", (code, signal) => {
			void this.handleProbeExit(probe, code, signal);
		});
	}

	/**
	 * @param {{ child: import("node:child_process").ChildProcess, sourceId: string, plan: BuilderPlan, blamed: Set<string>, stderrBuffer: string, outputPath: string, exited: boolean }} probe
	 * @param {number | null} code
	 * @param {NodeJS.Signals | null} signal
	 */
	async handleProbeExit(probe, code, signal) {
		if (probe.exited) return;
		probe.exited = true;
		if (this.probe === probe) this.probe = null;

		// Best-effort cleanup of the probe scratch file regardless of outcome.
		void rm(probe.outputPath, { force: true }).catch(() => {});

		if (this.disposed) return;
		if (!this.entries.has(probe.sourceId)) {
			// Source removed mid-probe; nothing else to do.
			return;
		}

		this.onLog(`ffmpeg[probe ${probe.sourceId}] exited code=${code ?? "null"} signal=${signal ?? "none"}`);

		const succeeded = code === 0 && !signal && probe.blamed.size === 0;

		if (succeeded) {
			this.quarantine.delete(probe.sourceId);
			this.onLog(`Quarantine probe succeeded for ${probe.sourceId}; rejoining pool.`);
			this.scheduleRespawn();
			return;
		}

		this.quarantineSources([probe.sourceId]);
		this.scheduleQuarantineRetry();
	}

	async killProbe() {
		const probe = this.probe;
		if (!probe) return;
		this.probe = null;
		const child = probe.child;
		if (!child || child.killed || probe.exited) return;
		await new Promise((resolve) => {
			const timeout = setTimeout(() => {
				try {
					child.kill("SIGKILL");
				} catch (_err) {
					// Already dead.
				}
				resolve();
			}, 1000);
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
		void rm(probe.outputPath, { force: true }).catch(() => {});
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

			const items = this.activeItems();
			if (items.length === 0) {
				this.onLog(`Snapshot pool has no active sources (all ${this.entries.size} quarantined); waiting for retry window.`);
				this.scheduleQuarantineRetry();
				return;
			}

			await mkdir(this.cacheDir, { recursive: true });
			this.attachWatcher();

			const builderItems = items.map(({ request, outputPath }) => ({ request, outputPath }));
			const plan = normalizePlan(typeof this.builder.buildPlan === "function" ? this.builder.buildPlan(builderItems) : this.builder.buildArgs(builderItems));

			this.currentSpawnPlan = plan;
			this.currentSpawnBlame = new Set();
			this.currentSpawnSourceIds = new Set(items.map((item) => item.sourceId));

			this.onLog(`Spawning ffmpeg snapshot pool (${items.length} source${items.length === 1 ? "" : "s"}): ${this.ffmpegPath} ${plan.argv.join(" ")}`);

			const child = this.spawn(this.ffmpegPath, plan.argv, {
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
				if (!trimmed) continue;
				this.onLog(`ffmpeg[pool]: ${trimmed}`);
				this.recordBlameFromLine(trimmed);
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
	 * @param {string} line
	 */
	recordBlameFromLine(line) {
		const plan = this.currentSpawnPlan;
		if (!plan) return;
		const blamed = plan.identifyFailures(line);
		for (const sourceId of blamed) {
			if (this.currentSpawnSourceIds.has(sourceId)) {
				this.currentSpawnBlame.add(sourceId);
			}
		}
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
	 * @param {string[]} sourceIds
	 */
	quarantineSources(sourceIds) {
		const now = Date.now();
		const reason = "ffmpeg gfxcapture failed to attach to source";
		for (const sourceId of sourceIds) {
			if (!this.entries.has(sourceId)) continue;
			const previous = this.quarantine.get(sourceId);
			const attempts = (previous?.attempts || 0) + 1;
			const backoff = Math.min(QUARANTINE_BASE_MS * QUARANTINE_BACKOFF_FACTOR ** (attempts - 1), QUARANTINE_MAX_MS);
			this.quarantine.set(sourceId, { until: now + backoff, attempts, reason });
			this.onLog(`Quarantined source ${sourceId} for ${backoff}ms (attempt ${attempts}): ${reason}`);
			this.onError(new Error(`Snapshot capture for ${sourceId} failed (${reason}); retrying in ${backoff}ms.`), sourceId);
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

		const blamed = Array.from(this.currentSpawnBlame);
		this.currentSpawnPlan = null;
		this.currentSpawnBlame = new Set();
		this.currentSpawnSourceIds = new Set();

		if (this.disposed) return;
		if (this.entries.size === 0) return;

		this.onLog(`ffmpeg[pool] exited code=${code ?? "null"} signal=${signal ?? "none"}`);

		const exitedSuccessfully = code === 0 && !signal;

		// Fault-isolated path: the builder pinned the failure on specific
		// sources, so quarantine them and respawn without burning a slot
		// on the global circuit breaker.
		if (!exitedSuccessfully && blamed.length > 0) {
			this.quarantineSources(blamed);
			this.scheduleQuarantineRetry();
			await sleep(this.restartDelayMs);
			if (!this.disposed && this.entries.size > 0) this.scheduleRespawn();
			return;
		}

		if (exitedSuccessfully) {
			await sleep(this.restartDelayMs);
			if (!this.disposed && this.entries.size > 0) this.scheduleRespawn();
			return;
		}

		const now = Date.now();
		this.failureTimestamps.push(now);
		this.failureTimestamps = this.failureTimestamps.filter((ts) => now - ts < FAILURE_WINDOW_MS);

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
		if (this.quarantineRetryTimer) {
			clearTimeout(this.quarantineRetryTimer);
			this.quarantineRetryTimer = null;
		}
		for (const entry of this.entries.values()) {
			if (entry.readTimer) clearTimeout(entry.readTimer);
		}

		const cleanupPaths = Array.from(this.entries.values()).map((entry) => entry.outputPath);
		this.entries.clear();
		this.filenameIndex.clear();
		this.quarantine.clear();

		await Promise.all([this.killChild(), this.killProbe()]);
		this.detachWatcher();
		await Promise.all(cleanupPaths.map((path) => rm(path, { force: true }).catch(() => {})));
	}
}

export { SnapshotPool, parsePngDimensions, QUARANTINE_BASE_MS, QUARANTINE_MAX_MS, MAX_CONSECUTIVE_FAILURES };
