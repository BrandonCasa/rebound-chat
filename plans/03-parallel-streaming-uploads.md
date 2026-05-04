# Plan 03: Parallelize uploads, stream the file body, never silently drop a pass

## Problem

The HLS uploader on the desktop client has three compounding inefficiencies:

**1. Strictly sequential uploads:**

```853:872:public/electron-live-stream.js
	async uploadPass() {
		if (!this.activeConfig || !this.sessionInfo || this.uploadInFlight) return;

		this.uploadInFlight = true;
		try {
			await this.ensureFallbackMasterPlaylist();
			const files = await this.candidateFiles();
			for (const filePath of files) {
				await this.uploadFile(filePath);
			}
			// ...
```

**2. Whole-file `readFile` before any byte hits the wire:**

```816:831:public/electron-live-stream.js
	async uploadFile(filePath) {
		// ...
		const body = isPlaylist ? await readFile(filePath, "utf8") : await readFile(filePath);
		const response = await fetch(url, {
			method: "PUT",
			headers: {
				"Content-Type": contentType,
				"X-Live-Ingest-Secret": this.sessionInfo.ingestSecret,
			},
			body,
		});
```

**3. `setInterval` + `uploadInFlight` silently drops passes whenever the previous one runs long:**

```875:881:public/electron-live-stream.js
	startUploader() {
		this.lastHeartbeatAt = 0;
		this.uploadTimer = setInterval(() => {
			void this.uploadPass();
		}, UPLOAD_POLL_INTERVAL_MS);
		void this.uploadPass();
	}
```

If a pass takes 800 ms on a slow tick (network jitter, large segment, server hiccup), the next 750 ms `setInterval` tick fires while `uploadInFlight === true` and the entire pass is skipped. There is no catch-up logic.

## Why this should be fixed

In steady state a pass uploads roughly:

- `init.mp4` (only changes once per stream, but is re-stat'd every pass)
- One new `segment-NNNNNN.m4s`
- `video.m3u8` (rewritten every segment by FFmpeg)
- `master.m3u8` (rarely changes)

With ~50–150 ms RTT to production, sequential uploads cost 200–600 ms of pure round-trip overhead per pass, on top of the actual byte transfer. Each `fetch` also has to negotiate (or at least re-validate) a TCP/TLS connection because there's no shared connection pool — Node's global `fetch` does keep a default agent, but it's per-`fetch`-instance and does not pipeline.

Then while the user is gaming:

- Network stack queueing depths fluctuate (game traffic, voice chat, Discord).
- Brief RTT spikes are common.
- A single 200 ms RTT spike during a pass with 4 sequential PUTs makes that pass exceed 750 ms.
- The next pass is silently dropped.
- The viewer sees a freeze even though FFmpeg is producing segments on time.

The single-segment `readFile` also peaks memory at the segment size (~2 MB at 8 Mbit × 2 s) before the upload starts, and the network stack waits for the full buffer before sending the first byte.

## Expected result

- Pass duration cut roughly in half under typical conditions (RTT cost paid once per pass, not once per file).
- Zero silently-dropped passes — slow passes immediately schedule the next pass on completion, fast passes wait the configured interval.
- First-byte-on-wire latency drops from "after entire file is in memory" to "as soon as the file is opened."
- Viewer sees segments land within the same window FFmpeg produces them, even when the local network is loaded by gaming traffic.

## How to fix

### Step 1: Use a single keep-alive HTTP dispatcher

At the top of `public/electron-live-stream.js`, create one `undici.Agent` for the lifetime of the manager:

```
import { Agent } from "undici";

const uploadDispatcher = new Agent({
  keepAliveTimeout: 30_000,
  keepAliveMaxTimeout: 60_000,
  pipelining: 1,
  connections: 4,
});
```

Pass `dispatcher: uploadDispatcher` to every `fetch()` call inside the manager (`uploadFile`, `sendHeartbeat`, `endSession`). This eliminates per-request TLS handshakes and keeps a small pool open to the ingest origin.

(`undici` already ships as a Node.js builtin used by `fetch`; importing the named export is fine.)

### Step 2: Stream the file body instead of buffering it

Replace `await readFile(filePath)` with a `Readable.toWeb(createReadStream(filePath))` and pass it as the `body` with `duplex: "half"`. For playlists, keep `readFile("utf8")` because they're small and we sometimes inspect them.

This avoids holding the segment in memory and lets the network stack start sending bytes as soon as the first chunk is read.

### Step 3: Upload segments in parallel; serialize playlists at the end

Refactor the pass into phases:

```
phase A: upload init.mp4 (only if not yet uploaded; check signature first — exists today)
phase B: upload all new segment-*.m4s files with bounded concurrency (Promise.all, limit ~3)
phase C: upload video.m3u8 then master.m3u8 (in that order; HLS clients re-fetch the playlist last)
```

Playlists must reference segments that already exist on the server, so phase C must happen strictly after phase B. Within a phase, ordering doesn't matter for correctness.

### Step 4: Self-rescheduling timer instead of `setInterval`

Replace `setInterval` with a recursive `setTimeout`-based scheduler:

```
const tick = async () => {
  if (this.stopping) return;
  const startedAt = Date.now();
  try {
    await this.uploadPass();
  } catch (err) {
    this.log(`Uploader pass error: ${err.message}`);
  }
  if (this.stopping) return;
  const elapsed = Date.now() - startedAt;
  const wait = Math.max(0, UPLOAD_POLL_INTERVAL_MS - elapsed);
  this.uploadTimer = setTimeout(tick, wait);
};
this.uploadTimer = setTimeout(tick, 0);
```

Behavior:
- Pass takes 200 ms → next pass scheduled in 550 ms (steady cadence preserved).
- Pass takes 1200 ms → next pass scheduled immediately (catch-up).
- Stop is cooperative (`this.stopping` flag).

Drop the `uploadInFlight` guard since this loop is single-threaded by construction.

### Step 5: Per-pass duration logging

Log `uploadPass duration=Xms files=Y bytes=Z` at the end of each pass. This makes the next time we investigate latency-while-gaming a five-minute job instead of a guessing game.

### Step 6: Reduce per-pass redundant work

- Skip `ensureFallbackMasterPlaylist()` after the first successful pass (cache the result for the lifetime of the session).
- Skip re-statting `init.mp4` once it's been uploaded (it doesn't change after FFmpeg writes it).
- Skip the directory listing if the polling interval was very short (< 250 ms) since FFmpeg won't have produced anything new.

### Step 7: Bound the heartbeat as a separate timer

The heartbeat currently piggybacks on the upload pass:

```864:867:public/electron-live-stream.js
			const heartbeatEvery = Math.max(5000, this.sessionInfo.heartbeatIntervalMs || 15000);
			if (Date.now() - this.lastHeartbeatAt >= heartbeatEvery) {
				await this.sendHeartbeat();
			}
```

Pull it onto its own `setInterval` so the heartbeat keeps the session alive even if upload passes start failing or piling up. The server treats heartbeat as health signal — letting it be coupled to a possibly-failing upload is the wrong default.

## Code organization & implementation notes

Today the uploader is interleaved into `ElectronLiveStreamManager`: directory listing, signature checks, fetch calls, heartbeat, and lifecycle all share the same class. Untangle it into a self-contained subsystem so each piece can be tested in isolation.

```
public/streaming/uploader/
  httpClient.js         -- creates and exposes a single keep-alive undici.Agent
  fileSource.js         -- pure I/O: fileSignature(), readPlaylist(), openSegmentStream()
  uploadPlanner.js      -- pure: given a directory listing, returns an UploadPlan
  uploadPass.js         -- runs a single pass: planner → planner output → I/O
  uploadScheduler.js    -- self-rescheduling timer; exposes start()/stop()
  heartbeat.js          -- separate setInterval; start()/stop()
  index.js              -- composes all of the above into a single { start, stop }
```

**Responsibility boundaries:**

| Module | Knows about | Doesn't know about |
|---|---|---|
| `httpClient.js` | undici Agents, dispatchers | Sessions, files, schedules |
| `fileSource.js` | fs, paths, file signatures | HTTP, sessions |
| `uploadPlanner.js` | HLS file naming conventions | I/O, HTTP, time |
| `uploadPass.js` | Planner output, http client, session secret | Scheduling, lifecycle |
| `uploadScheduler.js` | Time, run-once-at-a-time guarantee | What a pass does |
| `heartbeat.js` | Session, http client, time | Uploads |
| `index.js` | All of the above | None of their internals |

The class formerly known as `ElectronLiveStreamManager` calls `uploader.start({ sessionInfo, dir, log, http })` and `uploader.stop()`. It does not write `fetch()` calls anywhere.

**Pure planner signature:**

```js
/** @typedef {Object} UploadPlan
 *  @property {string[]} initFiles            -- to upload once
 *  @property {string[]} segments             -- to upload in parallel
 *  @property {string[]} playlists            -- to upload after segments, in order
 */

/** @type {(listing: DirEntry[], state: UploaderState) => UploadPlan} */
export function planUploadPass(listing, state) { ... }
```

Planner is pure. Tests pass synthetic listings; assert plan ordering.

**Pass signature** (`uploadPass.js`):

```js
/** @type {(plan: UploadPlan, ctx: PassContext) => Promise<PassResult>} */
export async function runUploadPass(plan, { http, session, log, fileSource }) {
  // phase A: init
  // phase B: parallel segments (Promise.all with bounded concurrency)
  // phase C: playlists in order (video.m3u8 then master.m3u8)
}
```

Pass takes its dependencies (http, fileSource) as parameters — never imports them directly. That makes it trivially mockable.

**Scheduler signature** (`uploadScheduler.js`):

```js
export function createScheduler({ runPass, intervalMs, log }) {
  let stopping = false;
  let timer = null;
  const tick = async () => {
    if (stopping) return;
    const startedAt = Date.now();
    try { await runPass(); } catch (err) { log(`pass error: ${err.message}`); }
    if (stopping) return;
    const elapsed = Date.now() - startedAt;
    timer = setTimeout(tick, Math.max(0, intervalMs - elapsed));
  };
  return {
    start: () => { timer = setTimeout(tick, 0); },
    stop: () => { stopping = true; clearTimeout(timer); },
  };
}
```

The scheduler is a closure factory, not a class. No `this`. Testable with fake timers (Jest/Vitest's `vi.useFakeTimers()`).

**Tests** (`public/streaming/uploader/__tests__/`):

- `uploadPlanner.test.js` — feed synthetic dir entries, assert plan shape.
- `uploadPass.test.js` — mock `http` and `fileSource`; assert phases run in order, segments run in parallel, playlists upload after segments.
- `uploadScheduler.test.js` — fake timers; verify slow pass schedules next at 0 ms; fast pass schedules at `intervalMs - elapsed`.
- `heartbeat.test.js` — fake timers; verify it ticks independently of upload state.
- `index.test.js` — wire everything together with fakes and verify start/stop is clean.

**Concurrency control** for parallel segment uploads — write a small `pLimit(n)` helper or use `p-limit`. Don't reach for a full async library. The bound is the keep-alive agent's `connections: 4`, so concurrency 3 is safe.

**Logging convention:** every pass logs one line at the end:

```
[live-stream] uploadPass duration=312ms files=3 bytes=1932401 phaseA=8ms phaseB=290ms phaseC=14ms
```

That single line gives us everything we need to diagnose performance issues without grepping a log dump. The format is regex-friendly so future telemetry can parse it.

**Migration order:**

1. Land `httpClient.js` and `fileSource.js` first; switch existing uploader to use them. No behavior change.
2. Land `uploadPlanner.js` (pure); existing uploader uses it but still does serial uploads. No behavior change.
3. Land `uploadPass.js` with parallel phase B. This is the first behavior change.
4. Land `uploadScheduler.js` (replaces `setInterval`). This eliminates dropped passes.
5. Land `heartbeat.js` (separate timer). This is independent and safe.

Each step is a separate PR with its own snapshot/test coverage.

## Validation

- Add an automated test that mocks `fetch` and verifies parallel segment uploads, in-order playlist uploads, and that a slow pass triggers an immediate next pass instead of skipping.
- Manually: stream while running iperf or a network-saturating download in the background; observe per-pass duration logs and confirm catch-up behavior.
