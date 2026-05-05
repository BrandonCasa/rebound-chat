import { strict as assert } from "node:assert";
import { describe, it, beforeEach, afterEach } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EventEmitter } from "node:events";
import { Readable } from "node:stream";

import { SnapshotPool, MAX_CONSECUTIVE_FAILURES, QUARANTINE_BASE_MS } from "../thumbnailer/snapshotPool.js";

/**
 * Minimal duck-typed ChildProcess used to drive the pool's lifecycle hooks
 * without spawning real ffmpeg. `emitStderr` pushes a line through the
 * stderr pipe, `exitWith` mirrors the real `exit` event semantics.
 */
class FakeChild extends EventEmitter {
	constructor() {
		super();
		this.pid = Math.floor(Math.random() * 100000) + 1000;
		this.killed = false;
		this.stderr = new Readable({ read() {} });
	}

	emitStderr(text) {
		this.stderr.push(`${text}\n`);
	}

	exitWith(code, signal = null) {
		if (this.killed) return;
		this.killed = true;
		queueMicrotask(() => this.emit("exit", code, signal));
	}

	kill() {
		if (this.killed) return;
		this.exitWith(null, "SIGTERM");
	}
}

const screenRequest = (id) => ({
	sourceId: id,
	source: { id, kind: "screen", name: id },
	intervalMs: 1000,
	scale: 0.5,
});

const windowRequest = (id, name = id) => ({
	sourceId: id,
	source: { id, kind: "window", name },
	intervalMs: 1000,
	scale: 0.5,
});

/**
 * Wait for a predicate to become true (small polling loop). Faster than
 * sleeping a fixed long duration and keeps tests deterministic-ish.
 */
const waitFor = async (predicate, { timeoutMs = 2000, intervalMs = 10 } = {}) => {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		if (predicate()) return;
		await new Promise((resolve) => setTimeout(resolve, intervalMs));
	}
	throw new Error("waitFor timed out");
};

/**
 * Plan factory: marks any line containing `failingSourceId` as belonging
 * to that source. Sufficient to exercise the pool's blame plumbing without
 * coupling tests to the windows builder's filter-id encoding.
 *
 * `withProbe` opts the builder into the new probe-based recovery path so
 * tests covering the probe pipeline can drive it independently from the
 * legacy respawn-on-retry behaviour.
 */
const makeFakeBuilder = ({ withProbe = false } = {}) => {
	let lastBuiltSourceIds = [];
	let lastProbedSourceId = null;
	const builder = {
		lastBuiltSourceIds: () => lastBuiltSourceIds.slice(),
		lastProbedSourceId: () => lastProbedSourceId,
		buildPlan: (items) => {
			lastBuiltSourceIds = items.map((item) => item.request.sourceId);
			const ids = new Set(lastBuiltSourceIds);
			return {
				argv: ["-y", "-fake", ...lastBuiltSourceIds],
				identifyFailures: (line) => {
					const blamed = [];
					for (const id of ids) {
						if (line.includes(id)) blamed.push(id);
					}
					return blamed;
				},
			};
		},
	};
	if (withProbe) {
		builder.buildProbePlan = (item) => {
			lastProbedSourceId = item.request.sourceId;
			const id = item.request.sourceId;
			return {
				argv: ["-y", "-fake-probe", id, item.outputPath],
				identifyFailures: (line) => (line.includes(id) ? [id] : []),
			};
		};
	}
	return builder;
};

describe("SnapshotPool", () => {
	let cacheDir;
	let spawned;
	let nextChild;
	let pool;
	let logs;
	let errors;
	let builder;

	beforeEach(async () => {
		cacheDir = await mkdtemp(join(tmpdir(), "snapshotpool-test-"));
		spawned = [];
		nextChild = null;
		logs = [];
		errors = [];
		builder = makeFakeBuilder();

		pool = new SnapshotPool({
			cacheDir,
			ffmpegPath: "ffmpeg",
			platform: "win32",
			restartDelayMs: 5,
			builder,
			spawn: (path, args) => {
				const child = new FakeChild();
				spawned.push({ path, args, child });
				nextChild = child;
				return child;
			},
			onThumbnail: () => {},
			onLog: (msg) => logs.push(msg),
			onError: (err, sourceId) => errors.push({ message: err.message, sourceId }),
		});
	});

	afterEach(async () => {
		await pool.dispose();
		await rm(cacheDir, { recursive: true, force: true }).catch(() => {});
	});

	it("quarantines the blamed source after a config-time failure and respawns without it", async () => {
		pool.setRequests([screenRequest("screen:0"), windowRequest("window:bad", "RzMonitor"), windowRequest("window:good", "Notepad")]);

		await waitFor(() => spawned.length === 1);
		assert.deepEqual(builder.lastBuiltSourceIds().sort(), ["screen:0", "window:bad", "window:good"]);

		const child = nextChild;
		child.emitStderr("[Parsed_gfxcapture_X @ 0x1] Failed to find capture source for window:bad");
		await new Promise((resolve) => setImmediate(resolve));
		child.exitWith(1);

		await waitFor(() => spawned.length === 2);
		assert.deepEqual(builder.lastBuiltSourceIds().sort(), ["screen:0", "window:good"], "respawn must omit the quarantined source");
		assert.equal(errors.length, 1, "exactly one onError per quarantine event");
		assert.equal(errors[0].sourceId, "window:bad");
		assert.match(errors[0].message, /window:bad/);
	});

	it("does not trip the global circuit breaker on fault-isolated failures", async () => {
		pool.setRequests([screenRequest("screen:0"), windowRequest("window:bad", "RzMonitor")]);

		// Drive (MAX_CONSECUTIVE_FAILURES + 2) attributable failures; pool
		// should keep running because each one is blamed on a single source.
		for (let attempt = 0; attempt < MAX_CONSECUTIVE_FAILURES + 2; attempt += 1) {
			await waitFor(() => spawned.length === attempt + 1, { timeoutMs: 5000 });
			const child = nextChild;
			// On the first spawn the bad source is included; afterwards it's
			// quarantined, so we just exit cleanly to keep the loop going.
			if (builder.lastBuiltSourceIds().includes("window:bad")) {
				child.emitStderr("[Parsed_gfxcapture_X @ 0x1] Failed to find capture source for window:bad");
				await new Promise((resolve) => setImmediate(resolve));
				child.exitWith(1);
			} else {
				child.exitWith(0);
			}
		}

		assert.equal(pool.disposed, false, "pool must remain alive when failures are attributable");
	});

	it("trips the global circuit breaker after MAX_CONSECUTIVE_FAILURES unattributable exits", async () => {
		pool.setRequests([screenRequest("screen:0")]);

		for (let attempt = 0; attempt < MAX_CONSECUTIVE_FAILURES; attempt += 1) {
			await waitFor(() => spawned.length === attempt + 1, { timeoutMs: 5000 });
			nextChild.exitWith(1);
		}

		await waitFor(() => pool.disposed === true, { timeoutMs: 5000 });
		assert.ok(
			errors.some((entry) => /pausing/.test(entry.message)),
			"global circuit breaker must surface a pause error"
		);
	});

	it("clears quarantine when a source is removed from the watched set", async () => {
		pool.setRequests([screenRequest("screen:0"), windowRequest("window:bad", "RzMonitor")]);
		await waitFor(() => spawned.length === 1);
		const child = nextChild;
		child.emitStderr("[Parsed_gfxcapture_X @ 0x1] Failed to find capture source for window:bad");
		await new Promise((resolve) => setImmediate(resolve));
		child.exitWith(1);

		await waitFor(() => pool.quarantine.has("window:bad"));

		pool.setRequests([screenRequest("screen:0")]);
		assert.equal(pool.quarantine.has("window:bad"), false);
	});

	it("does not respawn when every source is quarantined", async () => {
		pool.setRequests([windowRequest("window:bad", "RzMonitor")]);
		await waitFor(() => spawned.length === 1);
		const child = nextChild;
		child.emitStderr("[Parsed_gfxcapture_X @ 0x1] Failed to find capture source for window:bad");
		await new Promise((resolve) => setImmediate(resolve));
		child.exitWith(1);

		// Wait long enough for any debounced respawn to settle.
		await new Promise((resolve) => setTimeout(resolve, 200));
		assert.equal(spawned.length, 1, "no extra ffmpeg child should be started while the only source is quarantined");
		assert.ok(
			logs.some((line) => /no active sources/.test(line)),
			"pool should log that it's waiting for the quarantine retry window"
		);
	});
});

describe("SnapshotPool quarantine probe", () => {
	let cacheDir;
	let spawned;
	let nextChild;
	let pool;
	let logs;
	let errors;
	let builder;

	beforeEach(async () => {
		cacheDir = await mkdtemp(join(tmpdir(), "snapshotpool-probe-test-"));
		spawned = [];
		nextChild = null;
		logs = [];
		errors = [];
		builder = makeFakeBuilder({ withProbe: true });
	});

	const buildPool = (overrides = {}) => {
		pool = new SnapshotPool({
			cacheDir,
			ffmpegPath: "ffmpeg",
			platform: "win32",
			restartDelayMs: 5,
			builder,
			spawn: (path, args) => {
				const child = new FakeChild();
				spawned.push({ path, args, child });
				nextChild = child;
				return child;
			},
			onThumbnail: () => {},
			onLog: (msg) => logs.push(msg),
			onError: (err, sourceId) => errors.push({ message: err.message, sourceId }),
			...overrides,
		});
		return pool;
	};

	afterEach(async () => {
		if (pool) await pool.dispose();
		await rm(cacheDir, { recursive: true, force: true }).catch(() => {});
	});

	it("probes a quarantined source in isolation without respawning the main pool", async () => {
		buildPool();
		pool.setRequests([screenRequest("screen:0"), windowRequest("window:bad", "RzMonitor"), windowRequest("window:good", "Notepad")]);

		// First spawn: blame and quarantine window:bad.
		await waitFor(() => spawned.length === 1);
		const initial = nextChild;
		initial.emitStderr("[Parsed_gfxcapture_X @ 0x1] Failed to find capture source for window:bad");
		await new Promise((resolve) => setImmediate(resolve));
		initial.exitWith(1);

		// Second spawn: healthy 2-source main pool, no window:bad.
		await waitFor(() => spawned.length === 2);
		assert.deepEqual(builder.lastBuiltSourceIds().sort(), ["screen:0", "window:good"]);
		assert.equal(pool.quarantine.has("window:bad"), true);

		// Force the quarantine clock forward so the retry timer fires now.
		const entry = pool.quarantine.get("window:bad");
		entry.until = Date.now() - 1;
		pool.scheduleQuarantineRetry();

		// Probe spawn appears (3rd ffmpeg) but main pool (2nd) is still alive.
		await waitFor(() => spawned.length === 3);
		const probeArgs = spawned[2].args;
		assert.ok(probeArgs.includes("-fake-probe"), "third spawn must be the probe argv");
		assert.equal(builder.lastProbedSourceId(), "window:bad");
		assert.equal(pool.child, spawned[1].child, "main pool ffmpeg must remain the second spawn");
		assert.equal(spawned[1].child.killed, false, "main pool must not be torn down by the probe");
	});

	it("rejoins a recovered source after a successful probe and only then respawns the main pool", async () => {
		buildPool();
		pool.setRequests([screenRequest("screen:0"), windowRequest("window:bad", "RzMonitor")]);
		await waitFor(() => spawned.length === 1);
		const first = nextChild;
		first.emitStderr("[Parsed_gfxcapture_X @ 0x1] Failed to find capture source for window:bad");
		await new Promise((resolve) => setImmediate(resolve));
		first.exitWith(1);

		await waitFor(() => spawned.length === 2);
		// Trip retry early.
		pool.quarantine.get("window:bad").until = Date.now() - 1;
		pool.scheduleQuarantineRetry();

		await waitFor(() => spawned.length === 3);
		// Probe succeeds (exit 0, no blame on stderr).
		spawned[2].child.exitWith(0);

		// Pool rejoins window:bad and respawns the main pool with both sources.
		await waitFor(() => spawned.length === 4);
		assert.deepEqual(builder.lastBuiltSourceIds().sort(), ["screen:0", "window:bad"]);
		assert.equal(pool.quarantine.has("window:bad"), false);
	});

	it("re-quarantines with extended backoff when the probe fails", async () => {
		buildPool();
		pool.setRequests([screenRequest("screen:0"), windowRequest("window:bad", "RzMonitor")]);
		await waitFor(() => spawned.length === 1);
		const first = nextChild;
		first.emitStderr("[Parsed_gfxcapture_X @ 0x1] Failed to find capture source for window:bad");
		await new Promise((resolve) => setImmediate(resolve));
		first.exitWith(1);

		await waitFor(() => spawned.length === 2);
		const initialAttempts = pool.quarantine.get("window:bad").attempts;
		const initialBackoff = pool.quarantine.get("window:bad").until - Date.now();

		pool.quarantine.get("window:bad").until = Date.now() - 1;
		pool.scheduleQuarantineRetry();
		await waitFor(() => spawned.length === 3);

		// Probe fails the same way the main pool did.
		spawned[2].child.emitStderr("[Parsed_gfxcapture_0 @ 0x1] Failed to find capture source for window:bad");
		await new Promise((resolve) => setImmediate(resolve));
		spawned[2].child.exitWith(1);

		await waitFor(() => pool.quarantine.get("window:bad").attempts > initialAttempts);
		const updated = pool.quarantine.get("window:bad");
		assert.ok(updated.attempts > initialAttempts, "probe failure must grow the attempt count");
		assert.ok(updated.until - Date.now() > initialBackoff, "probe failure must extend the backoff");

		// Main pool was never disturbed.
		assert.equal(spawned[1].child.killed, false);
		assert.equal(pool.child, spawned[1].child);
		// No 4th ffmpeg should fire just because the probe finished — only the
		// scheduled probe retry, which is still seconds away.
		await new Promise((resolve) => setTimeout(resolve, 50));
		assert.equal(spawned.length, 3, "no extra main respawn should occur when the probe fails");
	});

	it("aborts a probe when the source is removed from the watched set mid-probe", async () => {
		buildPool();
		pool.setRequests([screenRequest("screen:0"), windowRequest("window:bad", "RzMonitor")]);
		await waitFor(() => spawned.length === 1);
		const first = nextChild;
		first.emitStderr("[Parsed_gfxcapture_X @ 0x1] Failed to find capture source for window:bad");
		await new Promise((resolve) => setImmediate(resolve));
		first.exitWith(1);

		await waitFor(() => spawned.length === 2);
		pool.quarantine.get("window:bad").until = Date.now() - 1;
		pool.scheduleQuarantineRetry();
		await waitFor(() => spawned.length === 3);
		const probeChild = spawned[2].child;

		pool.setRequests([screenRequest("screen:0")]);
		await waitFor(() => probeChild.killed === true);
		assert.equal(pool.probe, null);
		assert.equal(pool.quarantine.has("window:bad"), false);
	});

	it("falls back to legacy respawn when the builder lacks buildProbePlan", async () => {
		builder = makeFakeBuilder({ withProbe: false });
		// QUARANTINE_BASE_MS is 5_000 in production; shrink the retry window
		// for this test by faking time on the quarantine entry directly.
		buildPool();
		pool.setRequests([screenRequest("screen:0"), windowRequest("window:bad", "RzMonitor")]);
		await waitFor(() => spawned.length === 1);
		const first = nextChild;
		first.emitStderr("[Parsed_gfxcapture_X @ 0x1] Failed to find capture source for window:bad");
		await new Promise((resolve) => setImmediate(resolve));
		first.exitWith(1);

		await waitFor(() => spawned.length === 2);
		pool.quarantine.get("window:bad").until = Date.now() - 1;
		pool.scheduleQuarantineRetry();

		// Without buildProbePlan the pool tears down the main pool to retry
		// the bad source — i.e. the legacy behaviour.
		await waitFor(() => spawned.length === 3);
		assert.deepEqual(builder.lastBuiltSourceIds().sort(), ["screen:0", "window:bad"]);
		assert.ok(QUARANTINE_BASE_MS > 0);
	});
});
