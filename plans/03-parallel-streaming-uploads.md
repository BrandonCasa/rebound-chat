# Plan 03: Parallelize uploads, stream the file body, never silently drop a pass

## Update (2026-05-04)

- `public/streaming/` modularization from Plans 01-02 is in place (`defaults`, `types`, encoder modules, profile files, and related tests are present).
- Upload orchestration is still concentrated in `public/electron-live-stream.js`; `public/streaming/uploader/` does not exist yet.
- This plan remains the next operational bottleneck because upload pass timing still determines real viewer smoothness under network contention.

### Updated implementation order (incremental, low-risk)

1. Add `public/streaming/uploader/httpClient.js` and `fileSource.js`, then consume them from `public/electron-live-stream.js` without changing scheduling behavior.
2. Add `uploadPlanner.js` as a pure module and cover it with unit tests.
3. Land `uploadPass.js` with bounded parallel segment uploads + ordered playlists.
4. Replace interval polling with `uploadScheduler.js` (self-rescheduling `setTimeout` cadence).
5. Split heartbeat into `heartbeat.js` and make pass-duration logging mandatory.
6. Add `index.js` composition wrapper and only then reduce `ElectronLiveStreamManager` uploader responsibilities.

## Status of prerequisites

- **Plans 01–02**: Can be done in any order relative to this plan. The uploader refactor is independent of encoder defaults (Plan 01) and VBV bufsize (Plan 02). Plan 04 (UI rewrite) will eventually replace `ElectronLiveStreamManager` entirely — this plan extracts the uploader into a self-contained subsystem so that Plan 04 can wire it in cleanly rather than inheriting a monolith.

## Problem

The HLS uploader in `public/electron-live-stream.js` (`ElectronLiveStreamManager`) has three compounding inefficiencies.

**1. Strictly sequential uploads:**

`uploadPass()` iterates `candidateFiles()` and awaits each `uploadFile()` call in sequence. A pass uploads: `init.mp4`, one new segment, `video.m3u8`, `master.m3u8` — four sequential round trips before any file is in flight while the next is being fetched.

**2. Whole-file buffer before any byte hits the wire:**

`uploadFile()` calls `await readFile(filePath)` (or `readFile(filePath, "utf8")` for playlists) and passes the entire buffer as the `fetch` body. The network stack waits for the full file to load into memory before sending the first byte. For a ~2 MB segment at 8 Mbit/s this adds measurable first-byte latency.

**3. `setInterval` silently drops passes when the previous one runs long:**

`startUploader()` uses `setInterval` with an `uploadInFlight` guard. If a pass takes longer than the poll interval (e.g. due to network jitter on a gaming machine with shared uplink), the next tick fires while the guard is true and the entire pass is skipped — no log, no catch-up. The viewer sees a freeze even though FFmpeg is producing segments on time.

## Why this should be fixed

With ~50–150 ms RTT to production, sequential uploads cost 200–600 ms of pure round-trip overhead per pass, on top of the actual byte transfer. Each fetch also has to negotiate (or at least re-validate) a TCP/TLS connection because there's no shared connection pool.

During gaming:
- Network stack queueing depths fluctuate (game traffic, voice chat, Discord).
- Brief RTT spikes are common.
- A single 200 ms RTT spike during a pass with 4 sequential PUTs makes that pass exceed the poll interval.
- The next pass is silently dropped.
- The viewer sees a freeze even though FFmpeg is producing segments on time.

The `readFile` also peaks memory at the segment size (~2 MB at 8 Mbit × 2 s) before the upload starts.

## Expected result

- Pass duration cut roughly in half under typical conditions (RTT cost paid once per pass, not once per file).
- Zero silently-dropped passes — slow passes immediately schedule the next pass on completion, fast passes wait the configured interval.
- First-byte-on-wire latency drops from "after entire file is in memory" to "as soon as the file is opened."
- Viewer sees segments land within the same window FFmpeg produces them, even when the local network is loaded by gaming traffic.

## How to fix

### Step 1: Use a single keep-alive HTTP dispatcher

Create `public/streaming/uploader/httpClient.js`. It exports one shared `undici.Agent` for the lifetime of the manager:

```js
import { Agent } from "undici";

export const uploadAgent = new Agent({
  keepAliveTimeout: 30_000,
  keepAliveMaxTimeout: 60_000,
  pipelining: 1,
  connections: 4,
});
```

Pass `dispatcher: uploadAgent` to every `fetch()` call inside the uploader (`uploadFile`, `sendHeartbeat`, `endSession`). This eliminates per-request TLS handshakes and keeps a small pool open to the ingest origin.

`undici` is a Node.js builtin dependency (the same engine that backs `globalThis.fetch`); importing the named export is supported in the Node version Electron ships.

### Step 2: Stream the file body instead of buffering it

In `fileSource.js` (see code organization below), expose:

```js
export function openSegmentStream(filePath) {
  return Readable.toWeb(createReadStream(filePath));
}
```

In `uploadFile`, replace `await readFile(filePath)` with `openSegmentStream(filePath)` and add `duplex: "half"` to the fetch options for segments. For playlists keep `readFile("utf8")` — they are small and we sometimes inspect them before upload.

This avoids holding the segment in memory and lets the network stack start sending bytes as soon as the first chunk is read from disk.

### Step 3: Upload segments in parallel; serialize playlists after

Refactor the pass into three phases:

```
Phase A: upload init.mp4 (only once per session; skip if already uploaded)
Phase B: upload all new segment-*.m4s files with bounded concurrency (limit 3)
Phase C: upload video.m3u8 then master.m3u8 (in that order, sequential)
```

Playlists must reference segments that already exist on the server, so Phase C must happen strictly after Phase B. Within Phase B, ordering doesn't matter for correctness.

Use a small `pLimit(n)` helper or `p-limit` for concurrency control. The bound matches the keep-alive agent's `connections: 4`, so concurrency 3 is safe.

### Step 4: Self-rescheduling timer instead of `setInterval`

Replace `setInterval` + `uploadInFlight` guard with a recursive `setTimeout`-based scheduler in `uploadScheduler.js`:

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

Behavior:
- Pass takes 200 ms → next pass scheduled in 550 ms (steady cadence preserved).
- Pass takes 1200 ms → next pass scheduled immediately (catch-up).
- Stop is cooperative (`stopping` flag checked before re-scheduling).

Drop the `uploadInFlight` guard from the manager — this scheduler is single-threaded by construction.

### Step 5: Per-pass duration logging

Log one line at the end of each pass:

```
[live-stream] uploadPass duration=312ms files=3 bytes=1932401 phaseA=8ms phaseB=290ms phaseC=14ms
```

This makes the next latency investigation a five-minute job instead of a guessing game. The format is regex-friendly so future tooling can parse it.

### Step 6: Reduce per-pass redundant work

- Skip `ensureFallbackMasterPlaylist()` after the first successful pass (cache the result for the lifetime of the session).
- Skip re-statting `init.mp4` once it's been uploaded (it doesn't change after FFmpeg writes it).
- Skip the directory listing if the poll interval is very short (< 250 ms) since FFmpeg won't have produced anything new.

### Step 7: Bound the heartbeat as a separate timer

The heartbeat currently piggybacks on the upload pass. Pull it onto its own `setInterval` in `heartbeat.js` so the session stays alive even if upload passes start failing or piling up. The server treats the heartbeat as a health signal — coupling it to a possibly-failing upload is the wrong default.

## Code organization & implementation notes

Today the uploader is interleaved into `ElectronLiveStreamManager`. Untangle it into a self-contained subsystem so each piece can be tested in isolation:

```
public/streaming/uploader/
  httpClient.js         -- creates and exposes a single keep-alive undici.Agent
  fileSource.js         -- pure I/O: fileSignature(), readPlaylist(), openSegmentStream()
  uploadPlanner.js      -- pure: given a directory listing, returns an UploadPlan
  uploadPass.js         -- runs a single pass: planner → I/O
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

`ElectronLiveStreamManager` calls `uploader.start({ sessionInfo, dir, log, http })` and `uploader.stop()`. It does not contain `fetch()` calls for segment uploads.

**Pure planner signature:**

```js
/** @typedef {Object} UploadPlan
 *  @property {string[]} initFiles   -- upload once (first pass only)
 *  @property {string[]} segments    -- upload in parallel
 *  @property {string[]} playlists   -- upload after segments, in order
 */

/** @type {(listing: DirEntry[], state: UploaderState) => UploadPlan} */
export function planUploadPass(listing, state) { ... }
```

Planner is pure. Tests pass synthetic listings and assert plan ordering.

**Pass signature** (`uploadPass.js`):

```js
/** @type {(plan: UploadPlan, ctx: PassContext) => Promise<PassResult>} */
export async function runUploadPass(plan, { http, session, log, fileSource }) {
  // Phase A: init (once)
  // Phase B: parallel segments (pLimit(3))
  // Phase C: playlists in order (video.m3u8 then master.m3u8)
}
```

Pass takes its dependencies (http, fileSource) as parameters — never imports them directly. That makes it trivially mockable.

**Landing order** (each step can be a separate PR):

1. Land `httpClient.js` and `fileSource.js`; switch existing manager to use them. No behavior change.
2. Land `uploadPlanner.js` (pure); existing manager uses it but still does serial uploads. No behavior change.
3. Land `uploadPass.js` with parallel Phase B. First behavior change.
4. Land `uploadScheduler.js` (replaces `setInterval`). Eliminates dropped passes.
5. Land `heartbeat.js` (separate timer). Independent and safe.
6. Land `index.js` and wire into `ElectronLiveStreamManager`. Completes the extraction.

**Tests** (`public/streaming/uploader/__tests__/`):

- `uploadPlanner.test.js` — synthetic dir entries → assert plan shape (init/segments/playlists correctly bucketed).
- `uploadPass.test.js` — mock `http` and `fileSource`; assert phases run in order, segments run in parallel (concurrent calls), playlists upload after segments (sequential).
- `uploadScheduler.test.js` — fake timers (`node:timers/promises` or Vitest fake timers); verify slow pass schedules next at 0 ms; fast pass schedules at `intervalMs - elapsed`.
- `heartbeat.test.js` — fake timers; verify it ticks independently of upload state.
- `index.test.js` — wire everything together with fakes; verify start/stop is clean (no dangling timers).

**Logging convention** — one line per pass:

```
[live-stream] uploadPass duration=312ms files=3 bytes=1932401 phaseA=8ms phaseB=290ms phaseC=14ms
```

Regex-parseable for future telemetry.

## Validation

- Add an automated test that mocks `fetch` and verifies parallel segment uploads, in-order playlist uploads, and that a slow pass triggers an immediate next pass instead of skipping.
- Manually: stream while running a background bandwidth test; observe per-pass duration logs and confirm catch-up behavior.
- Confirm the session heartbeat fires on its own interval even when upload passes are consistently slow.
