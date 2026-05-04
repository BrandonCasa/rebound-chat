# Plan 06: Unified profiler with a local dashboard, Chrome trace export, and minimal-intrusion instrumentation

## Problem

The codebase has three distinct JavaScript execution contexts — none of them are profileable today without ad-hoc, manual work:

1. **The Electron renderer** (`src/`, Vite-served React app). Can be poked with Chrome DevTools' Performance tab, but only through the renderer's own DevTools window, and the data does not connect to anything else in the system.
2. **The Electron main process** (`public/electron.js`, `public/electron-live-stream.js`, `public/streaming/*`). This is where the streaming pipeline orchestrator lives — IPC handlers, FFmpeg subprocess spawn/manage, HLS upload loop, session bookkeeping. Today it has no profiling at all. The closest thing is `console.log` and `electron-log`.
3. **The backend server** (`server/src/`). Express 5 + Mongoose + Socket.IO + the live HLS ingest. Today: `morgan` request logs and `winston` info logs. No request-time histograms, no per-handler hot-path data.

When something gets slow — a stream upload pass takes 600 ms instead of 200 ms, an IPC roundtrip stalls the renderer, a CSRF middleware blocks for a strange reason — there is no unified place to see it. The streaming-related plans in this folder (01–05) all care about latency and per-stage timing; they reference numbers like "GPU readback ~475 MB/s" or "upload pass duration" but the code emits none of those numbers in a structured form. We measure those things ad hoc in shell, in our heads, in plt-style hand-printed timestamps.

We need a profiler that:

- **Spans all three execution contexts** (renderer, main, server) on a single timeline.
- **Hooks in for free in dev** — running `pnpm run profile` should be the entire setup. No Docker, no cloud account, no separate viewer install.
- **Has manual control surfaces** — start/stop CPU profile, take heap snapshot, start/stop a named trace recording, all from a single dashboard.
- **Has minimal manual code intrusion** — by default, HTTP requests, IPC calls, and FFmpeg lifecycle events show up automatically. Sprinkling `trace("buildHls", () => …)` adds detail in one line.
- **Costs nothing when off.** Production builds and normal `pnpm run electron-dev` should not pay a cycle for any of it.
- **Outputs the standard format** so we can throw a flame chart at any colleague (or at `https://ui.perfetto.dev`) without explaining a custom file format.

## Why this should be fixed

- Plan 01 ("eliminate GPU → CPU round trip"), Plan 03 ("parallel streaming uploads"), Plan 04 ("tune VBV bufsize") all hinge on numbers we cannot currently measure. Without profiling, "did it actually get faster?" is a vibe check.
- Plan 05 talks about a Live Status panel and stream health widget — both are downstream consumers of structured timing data that we are not collecting.
- The streaming hot path involves four hops (renderer click → IPC → FFmpeg spawn → HLS upload → server validate → storage), and any one of them can be the culprit when latency rises. A profiler that shows all four on one timeline is the only way to localize the culprit reliably.
- Heap usage during long streams is unmonitored. Memory leaks today are noticed when the user complains.
- A new contributor cannot answer "what is the slow part of the app?" without instrumenting from scratch every time.

## Expected result

After this plan ships:

- `pnpm run profile` does the entire setup: starts the server with `--inspect`, starts the renderer's Vite dev server, starts Electron with `--inspect`, launches a small **Profiler Hub** at `http://127.0.0.1:9876`, and opens that page in the default browser.
- The dashboard shows three connected sources (`main`, `server`, `renderer`) with green status dots.
- A live event stream shows HTTP requests, Electron IPC calls, and FFmpeg lifecycle events as they happen, with durations.
- Buttons on the dashboard let the user:
  - **Start trace** / **Stop trace** — record a window of trace events (Chrome Trace Event Format) and download a `trace.json` openable at `https://ui.perfetto.dev` or `chrome://tracing` (or by drag-and-drop into Chrome DevTools' Performance tab).
  - **Open in Perfetto** — one click that opens the latest trace in Perfetto via its postMessage-based loader, no manual file-drop required.
  - **CPU profile main / server (Ns)** — record a V8 CPU profile for N seconds; download as `.cpuprofile` (drag into Chrome DevTools for a flame chart).
  - **Heap snapshot main / server** — capture a `.heapsnapshot`; opens in Chrome DevTools' Memory tab.
- "Hot spans" panel summarizes the top N spans by total time and call count over the last 30 s, refreshed live.
- Inside any JS file across the codebase, the developer can write:
  ```js
  import { trace, traceAsync, startSpan, mark, metric } from "tools/profiler/core/trace.js";

  const result = trace("computeFoo", () => doExpensiveWork());
  const data = await traceAsync("uploadSegment", () => uploader.put(seg));
  const span = startSpan("renderFrame", { fps: 60 });
  // ...
  span.end({ droppedFrames: 0 });
  mark("ffmpeg.first-segment");
  metric("upload.bytes", buffer.length);
  ```
- All of those calls compile to a no-op early return when `process.env.PROFILE !== "1"` (Node) and when `import.meta.env.VITE_PROFILE !== "1"` (renderer). Verified by a benchmark in CI: a million `trace()` calls with profiling off complete in <50 ms.
- HTTP requests through Express, IPC handlers in Electron, and the FFmpeg subprocess emit structured events automatically with no per-handler edits.

## How to fix

This plan is broken into 7 phases. Phases A–C are the foundation (zero functional change, zero overhead when off). Phases D–F wire it into the three contexts. Phase G is the dev UX glue.

---

### Phase A — Tracing core: `trace()`, `startSpan()`, `mark()`, `metric()`

A single, tiny, dependency-free module that the rest of the system stands on.

**A1. Public API.** `tools/profiler/core/trace.js` exports five functions:

```js
trace(name, fn, attrs?)            // sync; returns fn's return value; emits a complete span
traceAsync(name, fn, attrs?)       // async; same, awaits fn
startSpan(name, attrs?) → handle   // returns an opaque handle
endSpan(handle, attrs?)            // ends a previously-started span
mark(name, attrs?)                 // instantaneous event (Chrome trace 'i' phase)
metric(name, value, attrs?)        // counter (Chrome trace 'C' phase)
```

Plus a debugging helper `getActiveSpans()` returning the set of currently-open spans for the current process.

**A2. The PROFILE-off fast path.** The very first line of every API function reads a module-local `enabled` boolean:

```js
let enabled = false;
export function trace(name, fn, attrs) {
  if (!enabled) return fn();
  // … instrumented path …
}
```

`enabled` is set once at module load time from `process.env.PROFILE === "1"` (Node) or `import.meta.env.VITE_PROFILE === "1"` (renderer; Vite inlines this at build time). The branch predictor handles the cold path; an `if`-check costs ≤ 1 ns. We will benchmark this in CI as a regression guard (Phase A6).

**A3. Event format.** Spans are buffered as Chrome Trace Event Format records:

```jsonc
{
  "name": "uploadSegment",
  "ph": "X",            // complete event
  "ts": 1700000000000,  // microseconds
  "dur": 187000,        // microseconds
  "pid": 12345,         // process id
  "tid": 1,             // thread id (we use 1 for main loop, 2+ for workers)
  "cat": "ipc",         // category (the module that emitted it)
  "args": { "size": 8192 }
}
```

Chrome Trace Event Format is the de-facto standard: Perfetto, `chrome://tracing`, Speedscope, the Node `--cpu-prof` output, and Chrome DevTools all read it natively. Picking it means we never have to write a viewer.

**A4. Buffering.** A ring buffer (`tools/profiler/core/buffer.js`) holds the last N events (default 50,000) per process. Drains happen on:

- Periodic flush every 250 ms when transport is connected.
- Explicit flush on `endTrace()` from the hub.
- Backpressure: when the buffer is 80% full, drain immediately.
- Process exit: best-effort sync flush (a JSONL file in `userData`/profiler-fallback/).

**A5. Time source.** All processes use `process.hrtime.bigint()` (Node) or `performance.now()` (renderer) plus a once-per-second wall clock pinging from the hub to align skew across processes. The hub's wall clock is the master; client timestamps are reported as `(localHrtime - hrtimeAtConnect) + (wallAtConnect)`.

**A6. Benchmark.** `tools/profiler/__tests__/perf.bench.js` runs in CI:

- 1 million `trace("noop", () => 1)` calls with PROFILE off → must complete in < 50 ms (≤ 50 ns/call).
- 1 million calls with PROFILE on (drained to /dev/null sink) → must complete in < 1 s (≤ 1 µs/call). This is informational, not a hard gate.

A2's "enabled = false" early return is what makes the off-case essentially free.

---

### Phase B — V8 Inspector wrapper: CPU profiles + heap snapshots

The two non-renderer contexts (main, server) are Node processes; Node ships a built-in `node:inspector` module that exposes the V8 Inspector Protocol. We don't need `0x`, Clinic.js, or `--cpu-prof`; the Inspector API is fully programmatic and gives us start/stop CPU profiling and heap snapshots.

**B1. Public API.** `tools/profiler/core/inspector.js` exports:

```js
startCpuProfile(name)   → Promise<sessionId>
stopCpuProfile(sessionId) → Promise<{ profile: V8CpuProfile }>
takeHeapSnapshot()       → AsyncIterable<string>   // chunked
```

Internally, each function lazily creates a `new inspector.Session()`, connects, posts `Profiler.start`/`stop` and `HeapProfiler.takeHeapSnapshot`, and disconnects.

**B2. CPU profile endpoint.** When the hub asks for a 5-second profile of `main`:

1. Hub → main IPC: `cpu/start { duration: 5000 }`
2. Main calls `startCpuProfile()`.
3. After 5 s (or on early `stop`), main calls `stopCpuProfile()` → `{ profile }`.
4. Main returns the JSON object back to the hub.
5. Hub serves it as `application/octet-stream` filename `main-2026-05-04T20-13-47.cpuprofile`.

**B3. Heap snapshot endpoint.** Same pattern, streamed (heap snapshots can be 100s of MB):

1. Hub → main: `heap/snapshot`
2. Main starts `HeapProfiler.takeHeapSnapshot` and pipes the chunked output back.
3. Hub returns it as `application/octet-stream` filename `main-2026-05-04T20-13-47.heapsnapshot`.

Both formats open natively in Chrome DevTools (Performance tab for `.cpuprofile`, Memory tab for `.heapsnapshot`).

**B4. The `--inspect` flag is *not* required.** `node:inspector` works in-process whether or not the inspector port is open. We do not need to expose `--inspect=9229` for our CPU/heap recording. We *will* still launch with `--inspect` in `pnpm run profile` so the developer can also use Chrome DevTools' "Open dedicated DevTools for Node" workflow if they want — but the dashboard works without it.

---

### Phase C — Hub: dashboard server, aggregator, transports

The hub is the single piece of running infrastructure. One Express server, one HTML page, one WebSocket endpoint, one Server-Sent Events endpoint. No third-party SDKs.

**C1. Layout.**

```
tools/profiler/hub/
  server.js            -- Express on 127.0.0.1:9876 (configurable)
  sources.js           -- registry of connected sources (main, server, renderer)
  aggregator.js        -- merges trace events from sources, sorts by aligned ts
  routes/
    cpu.js             -- POST /cpu/:source/start, /cpu/:source/stop
    heap.js            -- POST /heap/:source
    trace.js           -- POST /trace/start, /trace/stop, GET /trace/dump
    sources.js         -- GET /sources (list connected)
  dashboard/
    index.html
    app.js             -- vanilla ES modules; no React, no build step
    style.css
    perfetto.js        -- "open in Perfetto" via window.open + postMessage
```

**C2. Wire protocol.** Each source connects to the hub over WebSocket at `ws://127.0.0.1:9876/sink/:sourceName` and:

1. Sends a `hello` message with `{ pid, role: "main"|"server"|"renderer", hrtime0, wall0, version }`.
2. Streams batches of trace events as `{ type: "events", events: [...] }`.
3. Receives commands from the hub: `{ type: "cpu/start", duration }`, `{ type: "trace/start" }`, etc.
4. Replies with `{ type: "cpu/result", payload }` and so on.

The protocol shape lives in `tools/profiler/shared/protocol.js` and is imported by both the hub server and the source clients. Same idea as Plan 05 Phase F's `shared/streaming/protocol.js`: one type definition, both sides import.

**C3. Aggregator.** `tools/profiler/hub/aggregator.js` keeps a per-source rolling window (last 30 s by default) of merged events. For the live dashboard view, it pushes deltas via SSE (`/events`). For the trace download, it returns a single Chrome-trace-format JSON file (`{ "traceEvents": [ ... ], "displayTimeUnit": "ms" }`).

**C4. Dashboard.** Vanilla HTML + ES modules, no bundler. Loads at `http://127.0.0.1:9876/`. Layout:

```
┌─ Rebound Profiler ─────────────────────────────────────┐
│ Sources: ● main  ● server  ● renderer (3 connected)    │
├─ Trace recording ──────────────────────────────────────┤
│ [Start] [Stop & download] [Open in Perfetto]           │
│ Recording: 00:00:14   42 events                        │
├─ One-shot captures ────────────────────────────────────┤
│ CPU profile ▼ main   Duration: [5 s ▾]   [Record]     │
│ Heap snapshot ▼ main                     [Capture]    │
├─ Live event stream (last 200) ─────────────────────────┤
│ 12:01:33.110 server HTTP   POST /live/.../session  42ms│
│ 12:01:33.116 main   IPC    live-stream:start       18ms│
│ 12:01:33.140 main   FFMPEG spawn                  pid= │
│ 12:01:34.220 main   FFMPEG segment-000001.m4s   ready  │
│ 12:01:34.500 server HTTP   POST /live/.../upload  201ms│
│ 12:01:34.500 main   FETCH  uploadSegment          198ms│
├─ Hot spans (last 30 s) ────────────────────────────────┤
│ uploadSegment           37%  42 calls  x̄ 187ms        │
│ buildFfmpegCommand       5%   3 calls  x̄  12ms        │
│ csrfTokenMiddleware      4%  92 calls  x̄   1ms        │
│ … (top 10) …                                            │
└─────────────────────────────────────────────────────────┘
```

The "Open in Perfetto" button uses Perfetto's documented postMessage trace loader: open `https://ui.perfetto.dev`, wait for it to post `PING`, reply with `OPEN_TRACE` carrying the trace JSON. No backend cooperation needed; works offline-of-cloud.

**C5. Security.** The hub binds to `127.0.0.1` only. It refuses connections from non-loopback sources. It is only started when `PROFILE=1` is set; production builds never spawn it. There is no auth — loopback-only is the auth.

---

### Phase D — Default instrumentations (the "minimal manual code" promise)

These are the modules that make profiling free for the common cases. The user adds `import "tools/profiler/instrument/<name>.js"` once at the top of the entry file (or registers via the bootstrap in Phase G); no further per-handler edits.

**D1. Express middleware.** `tools/profiler/instrument/express.js` exports `profilerExpress()` which returns a middleware that:

- On request: opens a span `http.<method>.<route>` with attrs `{ method, path, ip, userAgent }`.
- On `res.finish` / `res.close`: closes the span with `{ status, bytes: parseInt(res.get('Content-Length')) }`.
- Uses `req.route?.path` if available (after route matching) so spans are aggregable.
- Special-cases the `/live/upload` and `/live/segment` paths to also emit a `metric("live.upload.bytes", contentLength)`.

Hook is one line in `server/src/app.js`:

```js
this.app.use(profilerExpress());
```

placed early so it captures middleware time too.

**D2. Electron IPC wrapper.** `tools/profiler/instrument/ipc.js` exports `wrapIpcMain(ipcMain)`. It replaces `ipcMain.handle` and `ipcMain.on`/`ipcMain.once` so every registered handler is wrapped:

```js
ipcMain.handle("live-stream:start", originalHandler)
// becomes equivalent to:
ipcMain.handle("live-stream:start", async (event, ...args) => {
  return traceAsync(`ipc.live-stream:start`, () => originalHandler(event, ...args));
});
```

Single hook in `public/electron.js`:

```js
import { wrapIpcMain } from "../tools/profiler/instrument/ipc.js";
wrapIpcMain(ipcMain);   // before any handlers register
```

This wrapper is idempotent (re-wrapping is a no-op) and degenerates to the identity when PROFILE is off.

**D3. FFmpeg subprocess instrumentation.** `tools/profiler/instrument/ffmpeg.js` exports `wrapSpawn(spawn)`. It returns a `spawn`-shaped function that:

- Detects `command.endsWith("ffmpeg")` (or `"ffmpeg.exe"`) and treats it specially.
- Opens a long-running span `ffmpeg.process` with `{ pid, args }`.
- Subscribes to stderr, parses FFmpeg's status lines (`frame=… fps=… time=… speed=…`) and emits one `metric("ffmpeg.fps", n)`, `metric("ffmpeg.speed", n)`, `metric("ffmpeg.dropped", n)` per status line.
- Watches for new segment files in the configured working dir (matches Plan 05's HLS output) and emits `mark("ffmpeg.segment", { filename })` per new file.
- On exit, closes the span with `{ code, signal, durationMs }`.

The wrapper is applied at the call site in `public/electron-live-stream.js`:

```js
import { spawn as rawSpawn } from "child_process";
import { wrapSpawn } from "../tools/profiler/instrument/ffmpeg.js";
const spawn = wrapSpawn(rawSpawn);
```

Once again, identity-mapped when PROFILE is off (one boolean check at module load).

**D4. fetch instrumentation (opt-in).** `tools/profiler/instrument/fetch.js` exports `wrapFetch()`. Replaces `globalThis.fetch` with a wrapped version that opens a span `fetch.<host>.<path>` per call. Opt-in because monkeypatching globals is invasive; we'll opt-in for the upload loop in `public/electron-live-stream.js` (Plan 03 cares about this) but leave the renderer alone unless the developer adds `wrapFetch()` themselves.

**D5. Process metrics.** `tools/profiler/instrument/process.js` runs a 1 Hz timer that emits:

- `metric("rss.bytes", process.memoryUsage().rss)`
- `metric("heap.used.bytes", process.memoryUsage().heapUsed)`
- `metric("event-loop.lag.ms", monitorEventLoopDelay().mean / 1e6)` (Node `perf_hooks.monitorEventLoopDelay`)
- `metric("cpu.user.us", process.cpuUsage().user)` (delta-tracked)

These appear in Perfetto as a counter strip across the timeline — extremely useful for spotting GC pauses or event-loop blocks.

---

### Phase E — Renderer client: PerformanceObserver + React Profiler bridge

The renderer needs the same `trace()` API plus one feature the others don't: a bridge from the browser's built-in `PerformanceObserver` and React's `<Profiler>` API into our trace stream.

**E1. Connection.** `tools/profiler/renderer/client.js` opens a WebSocket to the hub at `ws://127.0.0.1:9876/sink/renderer`, performs the `hello` handshake, and starts pumping events. Reconnects with backoff. When PROFILE flag is off, the entire module is a no-op (early return after import).

**E2. PerformanceObserver bridge.** `tools/profiler/renderer/perfObserver.js` registers observers for:

- `entryTypes: ["navigation"]` — page load timeline (LCP, FCP, TTI etc.)
- `entryTypes: ["paint"]` — first-paint, first-contentful-paint
- `entryTypes: ["measure"]` — `performance.measure(name, options)` calls anywhere in the renderer
- `entryTypes: ["longtask"]` — main-thread tasks > 50 ms
- `entryTypes: ["resource"]` — XHR/fetch/asset loads

Each entry becomes a span in the trace stream with `cat: "browser"`. This means anyone who already calls `performance.mark()`/`performance.measure()` in the renderer gets profiling for free.

**E3. React Profiler integration.** `tools/profiler/renderer/reactProfiler.jsx` exports `<ProfileScope id="…">`, a wrapper around React's `<Profiler>` that converts `onRender` callbacks into spans `react.<id>.<phase>`. Recommended placement: wrap each top-level route component in `App.jsx`. Optional, not required.

**E4. window.__profile.** When PROFILE is on, the client exposes `window.__profile = { trace, traceAsync, startSpan, mark, metric }`. This means a developer poking around the renderer's DevTools can type:

```js
__profile.startSpan("manual-investigation");
// ... interact with the UI ...
__profile.endSpan(handle);
```

and have it show up in the trace.

**E5. Vite plugin.** `tools/profiler/vite-plugin.js` reads `process.env.PROFILE` and:

- Defines `__PROFILE__` as a build-time constant so `if (!__PROFILE__) return;` tree-shakes away.
- Auto-injects `import "/profiler/client.js";` into the entry HTML when on.

The plugin is added to `vite.config.js` only when in dev mode; production builds never see it.

---

### Phase F — Wire-up: where the imports land

This phase is small but essential. Everything else is plumbing; this phase actually *connects* it.

**F1. Server (`server/src/app.js`).** At the very top, after the `import` block:

```js
import "../../tools/profiler/core/bootstrap.js";   // sets up trace transport
import { profilerExpress } from "../../tools/profiler/instrument/express.js";
import { profilerProcess } from "../../tools/profiler/instrument/process.js";
profilerProcess.start();
```

In `_initMiddleware`, before any other `app.use`:

```js
this.app.use(profilerExpress());
```

**F2. Electron main (`public/electron.js`).** After the `import` block:

```js
import "../tools/profiler/core/bootstrap.js";
import { wrapIpcMain } from "../tools/profiler/instrument/ipc.js";
import { profilerProcess } from "../tools/profiler/instrument/process.js";

wrapIpcMain(ipcMain);
profilerProcess.start();
```

**F3. Streaming module (`public/electron-live-stream.js`).** Replace the bare `spawn` import:

```js
import { spawn as rawSpawn } from "child_process";
import { wrapSpawn } from "../tools/profiler/instrument/ffmpeg.js";
const spawn = wrapSpawn(rawSpawn);
```

Optionally, sprinkle named spans at the architectural seams the other plans care about:

- `traceAsync("uploadSegment", () => …)` around the per-segment upload (Plan 03).
- `trace("buildFfmpegCommand", () => buildPipelineArgs(config, capabilities))` (Plan 01 cares about this).
- `mark("session.created", { sessionId })` after `createSession` resolves.

**F4. Renderer (`src/index.jsx`).** First import:

```js
import "./profiler/client.js";   // no-op when VITE_PROFILE !== "1"
```

In `vite.config.js`, conditionally add the plugin:

```js
import profilerPlugin from "./tools/profiler/vite-plugin.js";

plugins: [react(), ...(process.env.PROFILE === "1" ? [profilerPlugin()] : [])],
```

**F5. Bootstrap (`tools/profiler/core/bootstrap.js`).** This file is the one that decides whether the rest of the system is on:

```js
const enabled = process.env.PROFILE === "1";
if (enabled) {
  // open WS to hub, install transport, set core/trace.js's enabled = true
} else {
  // do absolutely nothing
}
export const profilerEnabled = enabled;
```

Importing it is a no-op when off. Importing it when on is what wires everything to the hub.

---

### Phase G — Dev UX: npm scripts, launcher, hub orchestration

This is what the user actually types.

**G1. NPM scripts.** Added to root `package.json`:

```jsonc
{
  "scripts": {
    "profile": "node tools/profiler/bin/launch.js",
    "profile:server": "PROFILE=1 PROFILE_SCOPE=server pnpm --filter rebound-server dev",
    "profile:renderer": "PROFILE=1 vite"
  }
}
```

`pnpm run profile` is the headline command and orchestrates everything; the others exist for narrower investigations.

**G2. The orchestrator.** `tools/profiler/bin/launch.js` does, in order:

1. Set `PROFILE=1` on the child env.
2. Start the **profiler hub** (Phase C) on `127.0.0.1:9876`.
3. Start `concurrently` with these processes (mirrors `electron-dev`'s structure):
   - `cross-env BROWSER=none PROFILE=1 pnpm run start` (Vite renderer)
   - `cd server && PROFILE=1 NODE_ENV=development node --inspect=9230 ./src/app.js` (server with inspector exposed)
   - `wait-on http://localhost:3000 && PROFILE=1 electron --inspect=9229 .` (Electron with inspector exposed)
4. Wait until at least the hub is up.
5. Open the default browser to `http://127.0.0.1:9876/` via `open`/`xdg-open`/`start` (cross-platform).
6. Forward stdout/stderr from the children with prefixes (`[main]`, `[server]`, `[renderer]`).
7. On Ctrl-C, terminate children and the hub gracefully.

Why a custom orchestrator instead of just adding it to `electron-dev`? Because `electron-dev` is the developer's main way of running the app and it should not pay the cost (or boot the hub) by default. `pnpm run profile` is the explicit on-switch.

**G3. The hub binary.** `tools/profiler/bin/hub.js` is the standalone hub server entrypoint, used by tests and by `launch.js`. Optional flags: `--port=9876`, `--no-open` (skip browser), `--quiet` (no stdout logging from the hub itself).

**G4. Browser auto-launch.** When `pnpm run profile` runs, it opens the dashboard. Pass `--no-open` (forwarded from launch.js) to suppress.

**G5. The "Open in Perfetto" button.** When clicked, the dashboard:

1. Fetches the current trace as a JSON blob from `/trace/dump`.
2. `window.open("https://ui.perfetto.dev")` returns a handle.
3. Listens for a `PING` postMessage from Perfetto (Perfetto's documented loader handshake).
4. Replies with `{ perfetto: { buffer: <ArrayBuffer>, title: "Rebound profile <date>" } }`.
5. Perfetto loads the trace; user sees a flame chart with all three sources interleaved.

Same handshake works for arbitrary trace files; this is Perfetto's official way of accepting traces from third parties.

---

## Code organization & implementation notes

### Top-level layout

```
tools/profiler/                                  (new top-level directory)
  package.json                                   -- internal workspace pkg, no published name
  README.md                                      -- "what is this & how do I use it"

  shared/
    protocol.js                                  -- WS message types + PROTOCOL_VERSION

  core/
    trace.js                                     -- trace/traceAsync/startSpan/endSpan/mark/metric
    traceFormat.js                               -- Chrome Trace Event helpers (B/E/X/i/C events)
    buffer.js                                    -- bounded ring buffer with backpressure
    inspector.js                                 -- node:inspector wrapper (CPU profile + heap)
    transport/
      ws.js                                      -- WebSocket client to hub
      file.js                                    -- fallback JSONL writer (used on hub-down/exit)
    bootstrap.js                                 -- entrypoint; reads PROFILE; sets enabled=true; opens transport

  instrument/
    express.js                                   -- profilerExpress() middleware
    ipc.js                                       -- wrapIpcMain(ipcMain)
    ffmpeg.js                                    -- wrapSpawn(spawn); detects ffmpeg by binary name
    fetch.js                                     -- wrapFetch() opt-in monkeypatch
    process.js                                   -- profilerProcess.start() — RSS/heap/loop-lag metrics

  renderer/
    client.js                                    -- WS connection + window.__profile + import side-effect
    perfObserver.js                              -- PerformanceObserver bridge
    reactProfiler.jsx                            -- <ProfileScope> component
  vite-plugin.js                                 -- Vite plugin (define __PROFILE__, inject client)

  hub/
    server.js                                    -- Express on 127.0.0.1:9876
    sources.js                                   -- WS source registry
    aggregator.js                                -- merge + sort + 30s window
    routes/
      cpu.js
      heap.js
      trace.js
      sources.js
    dashboard/
      index.html
      app.js                                     -- vanilla ES module, no build
      style.css
      perfetto.js                                -- postMessage handshake

  bin/
    launch.js                                    -- the `pnpm run profile` orchestrator
    hub.js                                       -- standalone hub entrypoint

  __tests__/
    trace.test.js                                -- unit tests for the trace API
    traceFormat.test.js                          -- format conformance tests
    buffer.test.js                               -- ring buffer + backpressure
    instrumentExpress.test.js                    -- supertest + assert spans emitted
    instrumentIpc.test.js                        -- fake ipcMain + assert wrap idempotent
    instrumentFfmpeg.test.js                     -- fake child_process + parses status lines
    aggregator.test.js                           -- merge/sort + skew alignment
    perf.bench.js                                -- the off-cost regression guard (Phase A6)
    fixtures/
      ffmpeg-stderr.txt                          -- canned FFmpeg output
      cpu-profile-tiny.cpuprofile                -- sanity round-trip
```

### Cross-process boundaries

There are exactly **three** boundaries; everything else is internal:

1. **Source ↔ Hub (WebSocket).** Message shapes live in `tools/profiler/shared/protocol.js` with `PROTOCOL_VERSION` exchanged on connect. Each source — main, server, renderer — speaks the same protocol. This mirrors Plan 05 Phase F's design: one shared types file, both sides import.

2. **Hub ↔ Browser dashboard (HTTP + SSE).** Live event stream is SSE (`text/event-stream`), simpler than WS for one-way push. Control endpoints (CPU profile start, heap snapshot, trace start/stop) are plain `POST` JSON.

3. **Dashboard ↔ Perfetto (postMessage).** Documented Perfetto loader handshake. No code we own runs in Perfetto — we just send it the bytes.

### Architectural rules

- **Trace API is pure.** `core/trace.js` does not know about transports. It calls `transport.emit(event)`; the transport is injected by `bootstrap.js`. This keeps `trace.js` testable without IPC fakes.
- **Bootstrap is the only side-effect importer.** Every other file in `tools/profiler/` is pure or only registers handlers when explicitly called. Importing `core/trace.js` does not start a connection; importing `core/bootstrap.js` does.
- **Instrumentation modules are no-op-when-off.** Each one checks `profilerEnabled` at load and returns identity functions when off. `wrapSpawn(spawn) === spawn` when off. `profilerExpress()` returns `(req, res, next) => next()` when off.
- **Hub is a separate process.** Don't run the hub inside Electron main; that ties the dashboard's lifetime to the app's, and the developer might want the dashboard to survive a renderer crash. The hub is a standalone Node process started by the orchestrator.
- **No third-party tracing SDKs.** Specifically: not OpenTelemetry. OTel is great for distributed multi-service production tracing but is heavy, opinionated about exporters, and pulls in 30+ packages. We need ~500 lines of glue around `node:inspector` and Chrome Trace Format.

### Type discipline (JSDoc)

Per the project convention (Plan 05 §"Type discipline"), define typedefs in `tools/profiler/shared/types.js`:

```js
/** @typedef {Object} TraceEvent
 *  @property {string} name
 *  @property {"B"|"E"|"X"|"i"|"C"} ph
 *  @property {number} ts            // microseconds since epoch (aligned)
 *  @property {number=} dur          // microseconds, only for ph: "X"
 *  @property {number} pid
 *  @property {number} tid
 *  @property {string=} cat
 *  @property {Object=} args
 */
/** @typedef {Object} HelloMessage
 *  @property {"hello"} type
 *  @property {"main"|"server"|"renderer"} role
 *  @property {number} pid
 *  @property {number} hrtime0
 *  @property {number} wall0
 *  @property {string} version
 */
/** @typedef {Object} Source
 *  @property {string} role
 *  @property {number} pid
 *  @property {WebSocket} socket
 *  @property {number} skewUs        // wall - hrtime alignment correction
 *  @property {string} status        // "connected"|"disconnected"
 */
```

### Naming and module conventions

- Files in `kebab-case.js`, exports in `camelCase`. Test files in `__tests__/` with mirrored structure.
- One top-level concept per file. The trace API is one file because the functions form one cohesive surface; the transport, format, and buffer are separate.
- No barrel re-exports. Every import names the file it is reading from. Renames are explicit.
- Imports ordered: stdlib → third-party → `shared/` → `tools/profiler/` → relative.

### Testing strategy

- **`core/trace.js`** — unit tests for: API shape, attribute merging, span pairing, error inside `fn` still ends span, async error propagation. No fakes — drains into a synchronous in-memory transport.
- **`core/inspector.js`** — round-trip test: start a CPU profile, run busy work, stop, assert the returned profile parses as Chrome's CPU profile JSON.
- **`instrument/express.js`** — supertest harness; fire 100 requests through a tiny app; assert one span per request with correct `name`, `dur`, `args`.
- **`instrument/ipc.js`** — fake `ipcMain` with `handle` + `on`; register handlers; invoke; assert spans emitted; assert wrap idempotency (wrapping twice is a no-op).
- **`instrument/ffmpeg.js`** — replay `fixtures/ffmpeg-stderr.txt` through a fake child; assert correct sequence of `metric` and `mark` events.
- **`hub/aggregator.js`** — pump in events from three fake sources with different skew; assert the merged stream is monotonically ordered.
- **`perf.bench.js`** — the off-cost benchmark. Runs in CI, fails if a `trace()` call with PROFILE off costs more than 50 ns.

Where Plan 05 separates pure modules (constraints, argv builders) from IO modules (process spawn, file write), the same applies here: `core/`, `hub/aggregator.js`, and the format helpers are pure; transports and the hub server are IO. The pure layer carries the test load.

### Per-phase notes

**Phase A** is the smallest behaviourally and the most important architecturally — get the API right, get the off-cost right, and the rest follows. Resist the temptation to make the API richer than the five functions listed. We will regret every extra knob.

**Phase B** uses Node's built-in inspector module — no native deps, no external binaries. The CPU profile JSON it returns is the V8 protocol format, which Chrome DevTools loads natively.

**Phase C** is the most code by line count but the least clever. It's an Express app that takes WS connections in and emits SSE out. The dashboard is plain HTML and ES modules; resist the temptation to bring in React/Vite/build tooling for it, because then the profiler depends on the thing being profiled.

**Phase D** is where the "minimal manual code" promise is fulfilled. If after this phase a developer can't hit `pnpm run profile`, click the app once, and see HTTP + IPC + FFmpeg events on a timeline without writing a single trace call, the phase is incomplete.

**Phase E** is small but tricky because the renderer is the only context where build-time constants matter. The Vite plugin is what makes `if (!__PROFILE__) return;` actually compile away.

**Phase F** is the one-line-per-file wire-up. Each touch point must be reviewed against "does this file behave differently when PROFILE is off?" The answer must be: no. Side effects are limited to: importing bootstrap, calling wrap functions, registering middleware. All identity-mapped when off.

**Phase G** is dev UX. The orchestrator is the user-facing surface; the launcher must be 100% reliable on macOS, Windows, and Linux. Use `open`/`start`/`xdg-open` via a tiny dispatch (no `open` package — too many deps).

---

## Migration & rollout

- **Phase A and B can ship together.** Pure plumbing, no functional change anywhere else. Adds a new top-level directory and one small bench in CI.
- **Phase C ships alone.** Standalone hub binary, dashboard. Verifiable in isolation via the bin script.
- **Phase D ships alongside Phase F's hookup for that instrumentation only.** I.e., when we add the Express middleware module, the same PR adds one line to `server/src/app.js`.
- **Phase E ships alone.** The renderer-side Vite plugin and client.
- **Phase G ships last.** The orchestrator is dependent on Phases C/F being live.

The plan is **off by default**. It introduces no runtime behavior change to any existing code path when `PROFILE=1` is not set. We can land the entire stack incrementally with no risk to the production app.

---

## Validation

- **Phase A (off-cost):** `node --test tools/profiler/__tests__/perf.bench.js` — 1M `trace()` calls with PROFILE off in <50 ms.
- **Phase A (on-correctness):** spans are paired (every B has its matching E within the same process); `args` round-trip correctly; nested spans nest; an exception inside the wrapped function still closes the span and re-throws.
- **Phase B:** record a 5-second CPU profile of a busy Node process; `JSON.parse(file)` succeeds and contains a `nodes` array compatible with Chrome DevTools.
- **Phase C:** open `http://127.0.0.1:9876/` with no sources connected — dashboard loads, shows "0 sources connected", controls are disabled. Connect a fake source via WS — dashboard shows it within 200 ms.
- **Phase D — Express:** run server with PROFILE=1, hit `GET /api/csrf` 100 times, then download a trace. The trace contains 100 spans named `http.GET./api/csrf` with sane durations.
- **Phase D — IPC:** in main, register a `live-stream:get-state` handler; call it 50 times; the trace shows 50 spans named `ipc.live-stream:get-state`.
- **Phase D — FFmpeg:** run a 30-second stream; the trace shows one long `ffmpeg.process` span and a stream of `ffmpeg.fps`/`ffmpeg.dropped` counter samples.
- **Phase D — process:** the trace shows 1 Hz `rss.bytes`, `heap.used.bytes`, and `event-loop.lag.ms` series for at least 30 seconds.
- **Phase E:** open the renderer's DevTools, type `__profile.startSpan("manual")`, do something, type `__profile.endSpan(handle)`. The span shows up in the dashboard's live stream.
- **Phase E:** load the app while recording a trace; the dashboard's hot-spans panel shows `react.App.mount` and similar React render spans.
- **Phase F:** boot the app with `pnpm run electron-dev` (NOT profile), verify that the Express middleware, IPC wrapper, and FFmpeg wrapper add zero spans and produce no stderr output. Compare against a baseline run captured before the plan: no measurable difference (within 1%) in time-to-first-render or end-to-end stream start latency.
- **Phase G:** `pnpm run profile` on macOS, Windows, and Linux opens the dashboard automatically; `Ctrl-C` cleans up all child processes (no orphan Electron, no orphan FFmpeg, no orphan Vite, no listening ports left over).
- **End-to-end:** record a 60-second trace covering a full stream session. Open it in Perfetto via the "Open in Perfetto" button. Visually verify that `http.POST./live/api/.../session` (server), `ipc.live-stream:start` (main), and `ffmpeg.process` (main) all appear on the same timeline with consistent timestamps (skew < 5 ms after alignment).
