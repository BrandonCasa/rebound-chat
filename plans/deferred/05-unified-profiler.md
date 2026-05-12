# Plan 05: Unified observability with OpenTelemetry + Jaeger across renderer, main, and server (plus on-demand CPU/heap profiles)

## Update (2026-05-04)

- There is currently no `tools/profiler/` workspace in the repo, so this plan should be executed as a staged bootstrap rather than a single large drop.
- Plan 03 uploader instrumentation points and Plan 04 capability-probe outputs are still pending; this plan should not block on them for core OTel rollout.
- The first win is end-to-end traceability for renderer click -> IPC -> main -> server request flow; GPU/deep profiling can remain explicitly optional until the control plane and uploader timing are stable.

### Updated rollout strategy

1. Phase A + B + C + D first (Jaeger + Node + renderer + propagation) with strict off-by-default gating.
2. Phase E limited to FFmpeg span wrapper + lightweight runtime heartbeat events.
3. Phase F (CPU/heap inspector tooling) can land in parallel with E because it is OTel-independent.
4. Phase G orchestrator after A-F are proven individually.
5. Phase H (GPU profiling) split into:
   - H-live: vendor-agnostic counter polling where available.
   - H-deep: vendor-specific deep capture wrappers as optional add-ons.

## Status of prerequisites

- **Plans 01–03** (NVENC defaults, VBV bufsize, parallel uploads): All should be complete before this plan. Plan 05 Phase H (GPU profiling) references timing numbers that Plans 01–03 affect (encoder latency, per-segment VBV behavior, upload pass durations). The profiler is most useful after the hot-path changes have landed and we need to verify they actually helped.
- **Plan 04** (UI rewrite): Phase A's `public/streaming/capabilities/` probe is a prerequisite for Plan 05 Phase H's GPU profiling. Phase H's `pnpm profile:gpu` reuses the capability probe to detect GPU vendor and select the right backend — do not build a separate detection path in Plan 05. If Plan 04 Phase A is not yet complete when this plan starts, build a lightweight standalone version of `gpuDetect/` for Phase H and reconcile with Plan 04 Phase A later.

## Problem

The codebase has three distinct JavaScript execution contexts and none of them are profileable today without ad-hoc, manual work:

1. **The Electron renderer** (`src/`, Vite-served React app). Can be poked with Chrome DevTools, but the data does not connect to anything else in the system.
2. **The Electron main process** (`public/electron.js`, `public/electron-live-stream.js`, `public/streaming/*`). No profiling at all. The closest thing is `console.log` and `electron-log`.
3. **The backend server** (`server/src/`). Express 5 + Mongoose + Socket.IO + live HLS ingest. Today: `morgan` request logs and `winston` info logs. No request-time histograms, no per-handler hot-path data.

After Plans 01–03, the streaming pipeline is cleaner — but "did the encoder latency actually drop?" and "are upload passes faster?" are still vibe checks unless the code emits structured timing data. The streaming-related plans all care about latency and per-stage timing; none of the code currently emits those numbers in a form that can be queried.

We need a profiler that:

- **Spans all three execution contexts** on a single timeline.
- **Hooks in for free in dev** — `pnpm run profile` is the entire setup.
- **Has manual control surfaces** — start/stop CPU profile, take heap snapshot, arbitrary span recording from any line of code.
- **Has minimal code intrusion** — HTTP requests, Express routes, Mongoose queries, Socket.IO, fetch, IPC calls, and FFmpeg lifecycle events appear automatically. Sprinkling `tracer.startActiveSpan("buildHls", fn)` adds detail in one line.
- **Costs nothing when off.** Production builds and normal `pnpm run electron-dev` pay zero cycles.
- **Uses an industry-standard format and viewer** (OpenTelemetry + Jaeger).

## Why this should be fixed

- Plans 01 and 02 modified encoder latency and VBV behavior; Plan 03 changed upload timing. Without profiling, "did it actually get faster?" is a vibe check.
- Plan 04 talks about a Live Status panel and stream health widget — both are downstream consumers of structured timing data we are not collecting.
- The streaming hot path involves four hops (renderer click → IPC → FFmpeg spawn → HLS upload → server validate → storage). Distributed tracing is the only correct way to localize where latency comes from.
- Heap usage during long streams is unmonitored.

## Expected result

- `pnpm run profile` starts a local Jaeger backend, Vite, Electron, and the server — all with OpenTelemetry enabled. Opens `http://127.0.0.1:16686` automatically.
- Jaeger shows three services: `rebound-renderer`, `rebound-main`, `rebound-server`. A click in the renderer that fires `live-stream:start` over IPC shows up as **one trace** with child spans across all three processes.
- Auto-instrumentations cover Express routes, Mongoose queries, Socket.IO, fetch/HTTP, DNS — no per-handler edits required.
- Custom-but-thin instrumentations cover: Electron IPC (trace context flows renderer→main), FFmpeg subprocess (per-frame status events, per-segment write events), React (commit/render spans for top-level routes).
- All of the above is **off by default**. `pnpm run electron-dev` and `pnpm run dist` are unaffected.
- On-demand CPU profiles and heap snapshots via `pnpm profile:cpu` / `pnpm profile:heap` produce `.cpuprofile` / `.heapsnapshot` files that drag-and-drop into Chrome DevTools.
- `pnpm profile:gpu` polls live GPU counters (encoder utilization, VRAM, PCIe traffic) at 1 Hz, attaches them as span events on the active `ffmpeg.process` OTel span, and optionally wraps FFmpeg under the vendor's deep profiler.

## How to fix

This plan is broken into 8 phases (A–H). Phases A–G are the core OTel + CPU/heap infrastructure. Phase H adds GPU profiling.

---

### Phase A — Local Jaeger backend

Jaeger v2 is built on top of the OpenTelemetry Collector and speaks OTLP natively (no separate collector deployment).

**A1. Run mode.** Two modes, auto-selected at runtime:

- **Docker mode (preferred):** `docker run --rm -d --name rebound-jaeger -p 16686:16686 -p 4317:4317 -p 4318:4318 jaegertracing/jaeger:<pinned-version>`
- **Binary fallback (no Docker required):** Download once into `dev/bin/jaeger` (gitignored) and run directly.

The orchestrator (Phase G) probes `docker ps` and falls back automatically.

**A2. CORS configuration.** The renderer posts OTLP/HTTP from `http://localhost:3000` to `http://127.0.0.1:4318`. Configure permissive CORS for localhost origins via env vars baked into the run command:

```
COLLECTOR_OTLP_HTTP_CORS_ALLOWED_ORIGINS=http://localhost:3000,app://-
COLLECTOR_OTLP_HTTP_CORS_ALLOWED_HEADERS=*
```

**A3. What the Jaeger UI gives us for free:**
- Search by service, operation, tag, duration, time range.
- Trace timeline waterfall with attributes, events, logs.
- Service dependency graph (auto-derived: shows renderer → main → server).
- Trace comparison view — diff two traces span-by-span (e.g. before/after a Plan 02 default change).

---

### Phase B — OpenTelemetry SDK in the Node processes (server + Electron main)

Both the server and Electron main are Node runtimes. They share the same SDK and auto-instrumentation pack.

**B1. Dependencies.** Added to root `package.json`:

```json
{
  "@opentelemetry/api": "^1.x",
  "@opentelemetry/sdk-node": "^0.x",
  "@opentelemetry/auto-instrumentations-node": "^0.x",
  "@opentelemetry/exporter-trace-otlp-proto": "^0.x",
  "@opentelemetry/resources": "^1.x",
  "@opentelemetry/semantic-conventions": "^1.x"
}
```

**B2. Bootstrap modules.** `tools/profiler/otel/bootstrapNode.js` (shared helper) + two thin wrappers:

```js
// tools/profiler/otel/bootstrapNode.js
export function startOtel({ serviceName }) {
  if (!process.env.OTEL_TRACES_EXPORTER) return null;
  const sdk = new NodeSDK({ /* resource, exporter, auto-instrumentations */ });
  sdk.start();
  process.once("SIGTERM", () => sdk.shutdown().catch(() => {}));
  return sdk;
}
```

```js
// tools/profiler/otel/main.bootstrap.js
import { startOtel } from "./bootstrapNode.js";
startOtel({ serviceName: "rebound-main" });
```

**B3. Load order.** OTel must be loaded before any other module. Pass `--import=./tools/profiler/otel/main.bootstrap.js` (Node ≥ 20.6) or `--require=` (older) to the Electron Node binary. This flag is only present in the `pnpm run profile` scripts.

**B4. Off-by-default.** Three layers:
1. Bootstrap early-returns when `OTEL_TRACES_EXPORTER` is unset.
2. `pnpm run electron-dev` does not pass `--import=…bootstrap.js`.
3. Production builds have no import path to the bootstrap.

**B5. Auto-instrumentation coverage** (from `@opentelemetry/auto-instrumentations-node`):
- **Server:** every Express route → span; every Mongoose query → child span; every Socket.IO frame → span.
- **Main:** every Node `fetch()` (Plan 03's upload loop) → span; outgoing HTTP requests → span.
- FS instrumentation is disabled by default (too noisy).

---

### Phase C — OpenTelemetry SDK in the renderer

The renderer is a browser context; it uses `@opentelemetry/sdk-trace-web`.

**C1. Dependencies.** Added to root `package.json`:
```json
{
  "@opentelemetry/sdk-trace-web": "^1.x",
  "@opentelemetry/context-zone": "^1.x",
  "@opentelemetry/exporter-trace-otlp-http": "^0.x",
  "@opentelemetry/instrumentation-fetch": "^0.x",
  "@opentelemetry/instrumentation-document-load": "^0.x",
  "@opentelemetry/instrumentation-user-interaction": "^0.x"
}
```

**C2. Bootstrap.** `tools/profiler/otel/renderer.bootstrap.js` — gated by `import.meta.env.VITE_OTEL_ENABLED === "1"`. When enabled: installs `WebTracerProvider` with `ZoneContextManager`, `DocumentLoadInstrumentation`, `UserInteractionInstrumentation`, `FetchInstrumentation`.

**C3. Vite plugin.** `tools/profiler/otel/vite-plugin.js` — when `VITE_OTEL_ENABLED=1`, virtually injects `import "tools/profiler/otel/renderer.bootstrap.js"` before anything else in the bundle. When unset, the plugin is a no-op and the SDK is not bundled at all.

**C4. What we get for free:**
- `documentLoad` — top-level span per page load.
- `userInteraction` — every click/submit is a span; subsequent fetches become children.
- `fetch` — every API call is a span; `traceparent` headers injected on calls to localhost → server spans appear as children.

---

### Phase D — Distributed trace context across HTTP, IPC, and FFmpeg

**D1. HTTP propagation (free).** The renderer's `FetchInstrumentation` injects W3C `traceparent` headers. The server's `HttpInstrumentation` extracts the header. Renderer↔Server propagation: zero work.

**D2. Electron IPC propagation (custom, ~50 lines).** `tools/profiler/otel/instrumentation/ipc.js`:

```js
// renderer side
export function instrumentIpcRenderer(ipcRenderer) {
  const original = ipcRenderer.invoke.bind(ipcRenderer);
  const tracer = trace.getTracer("rebound-ipc");
  ipcRenderer.invoke = (channel, ...args) =>
    tracer.startActiveSpan(`ipc.invoke ${channel}`, async (span) => {
      const carrier = {};
      propagation.inject(context.active(), carrier);
      try { return await original(channel, { __otel: carrier, payload: args }); }
      finally { span.end(); }
    });
}

// main side
export function instrumentIpcMain(ipcMain) { /* extract context, wrap handle/on/once */ }
```

The `{ __otel, payload }` envelope is hidden on both sides behind the wrapper. Application code never sees it. The wrappers are identity functions when `OTEL_TRACES_EXPORTER` is unset.

**D3. Verification target.** After Phase D, clicking "Start streaming" should produce this Jaeger trace:

```
rebound-renderer  user.click handle-start-stream            120 ms
└─ rebound-renderer  ipc.invoke live-stream:start            118 ms
   └─ rebound-main      ipc.handle live-stream:start         115 ms
      ├─ rebound-main      fetch POST /live/api/session        42 ms
      │  └─ rebound-server  POST /live/api/session              40 ms
      │     ├─ rebound-server  mongoose StreamSession.create    12 ms
      │     └─ rebound-server  mongoose StreamSession.save       6 ms
      └─ rebound-main      ffmpeg.process                     72 ms (ongoing)
```

---

### Phase E — Custom span emitters (FFmpeg, React, runtime metrics)

**E1. FFmpeg subprocess instrumentation.** `tools/profiler/otel/instrumentation/ffmpeg.js` exports `wrapSpawn(spawn)`. Returns a `spawn`-shaped function that:

- Detects `command.endsWith("ffmpeg")` (or `ffmpeg.exe`) and treats it specially.
- Opens a long-lived span `ffmpeg.process` with `{ "ffmpeg.args": args.join(" "), "ffmpeg.pid": child.pid }`.
- Parses FFmpeg's status lines from stderr (`frame=… fps=… time=… speed=…`) → `span.addEvent("status", { fps, speed, dropped, frame, time })`.
- Emits `segment.write` events on `Opening '…' for writing` lines.
- On exit: sets `{ "ffmpeg.exit_code", "ffmpeg.signal" }` and ends the span.

Use site in `public/electron-live-stream.js` (current) or `public/streaming/process.js` (Plan 04):

```js
import { spawn as rawSpawn } from "child_process";
import { wrapSpawn } from "../tools/profiler/otel/instrumentation/ffmpeg.js";
const spawn = wrapSpawn(rawSpawn);  // identity when OTel disabled
```

If Plan 04 is complete by the time this plan lands, use `public/streaming/process.js` instead of `public/electron-live-stream.js`.

**E2. React Profiler bridge.** `tools/profiler/otel/instrumentation/reactProfiler.jsx` exports `<ProfileScope id="…">` — a thin wrapper around React's `<Profiler>` that emits `react.<id>.<phase>` spans when `VITE_OTEL_ENABLED=1`. Used in `src/App.jsx` to wrap top-level routes. No-ops when disabled.

**E3. Runtime metrics.** `tools/profiler/otel/instrumentation/runtimeMetrics.js` uses `perf_hooks.monitorEventLoopDelay` + `process.memoryUsage()` and emits `runtime.heartbeat` span events at 1 Hz per process with `rss.bytes`, `heap.used.bytes`, `event_loop.lag.ms`.

**E4. Manual API.** No new API — use the official OTel API directly:

```js
import { trace } from "@opentelemetry/api";
const tracer = trace.getTracer("rebound-streaming");

await tracer.startActiveSpan("uploadSegment", async (span) => {
  span.setAttribute("size", buf.length);
  try { return await uploader.put(seg); } finally { span.end(); }
});
```

**E5. Convenience helper (optional).** `tools/profiler/otel/util.js` exports `withSpan(name, fn, attrs?)` and `withSpanAsync(name, fn, attrs?)` to eliminate the `try/finally` boilerplate:

```js
export function withSpan(name, fn, attrs) {
  return tracer.startActiveSpan(name, attrs ? { attributes: attrs } : {}, (span) => {
    try { return fn(span); }
    catch (e) { span.recordException(e); span.setStatus({ code: 2 }); throw e; }
    finally { span.end(); }
  });
}
```

---

### Phase F — On-demand CPU profiles and heap snapshots

**F1. Wrappers.** `tools/profiler/inspector/cpu.js` and `tools/profiler/inspector/heap.js` use Node's built-in `node:inspector` to record `.cpuprofile` and `.heapsnapshot` files. Both are thin wrappers (~20 lines each).

**F2. CLI commands:**
- `pnpm profile:cpu --target=main --duration=5` → sends a request to a debug HTTP endpoint on the target process → writes `dev/profiles/main-<timestamp>.cpuprofile`
- `pnpm profile:heap --target=server` → same shape → writes `dev/profiles/server-<timestamp>.heapsnapshot`

The debug endpoint is registered on `127.0.0.1:9876` (main) / `9877` (server) **only** when `OTEL_TRACES_EXPORTER` is set.

**F3. File destination.** `dev/profiles/<service>-<ISO timestamp>.<ext>` — gitignored.

---

### Phase G — Dev UX: `pnpm run profile` orchestrator

**G1. NPM scripts.** Added to root `package.json`:

```json
{
  "profile":          "node tools/profiler/bin/launch.js",
  "profile:server":   "node tools/profiler/bin/launch.js --only=server",
  "profile:renderer": "node tools/profiler/bin/launch.js --only=renderer",
  "profile:cpu":      "node tools/profiler/inspector/cli.js cpu",
  "profile:heap":     "node tools/profiler/inspector/cli.js heap",
  "profile:gpu":      "node tools/profiler/gpu/cli.js"
}
```

**G2. The orchestrator.** `tools/profiler/bin/launch.js`:

1. Probe Docker → start Jaeger via Docker or download/run binary fallback.
2. Wait for `http://127.0.0.1:16686/` to respond 200 (poll, 5 s timeout).
3. Set environment for child processes:
   ```
   OTEL_TRACES_EXPORTER=otlp
   OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:4318
   OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf
   VITE_OTEL_ENABLED=1
   VITE_OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:4318
   ```
4. Start `concurrently` with three children (mirrors `electron-dev`):
   - Vite renderer (with `VITE_OTEL_ENABLED=1` → bundle includes renderer bootstrap)
   - `node --import=../tools/profiler/otel/server.bootstrap.js ./src/app.js`
   - `wait-on http://localhost:3000 && electron --import=./tools/profiler/otel/main.bootstrap.js .`
5. After a 3 s grace period, open `http://127.0.0.1:16686/` in the default browser.
6. On Ctrl-C: stop children, stop Jaeger, exit clean (no orphan processes).

**G3. `--only=` modes.** `--only=server` or `--only=renderer` for narrower investigations.

---

### Phase H — GPU profiling for the streaming pipeline

OpenTelemetry tracks CPU-side work. The encoder runs on the GPU (NVENC, QSV, AMF, VideoToolbox). To answer the questions Plans 01–03 ask — "did the VBV tightening (Plan 02) make segment sizes more uniform?", "did Plan 01's ULL defaults free up NVENC headroom?" — we need GPU-side observability.

Phase H adds two layers:
- **Live GPU counters** during a stream, polled at 1 Hz, attached as `gpu.sample` span events on the active `ffmpeg.process` OTel span.
- **Deep capture** — vendor-specific `pnpm profile:gpu --vendor=…` that wraps FFmpeg under the right vendor profiler.

**H1. Vendor + platform detection.** Reuses Plan 04 Phase A's `public/streaming/capabilities/gpuDetect/` module. If Plan 04 Phase A is not complete, build a standalone `tools/profiler/gpu/detect.js` that runs the same logic and reconcile the two later.

The full support matrix:

| OS / Arch | NVIDIA | Intel | AMD | Apple |
|---|---|---|---|---|
| Windows x86_64 | ✅ NVML + Nsight Systems + GPUView | ✅ PresentMon + VTune + GPA | ✅ PresentMon + RGP + μProf | n/a |
| Linux x86_64 | ✅ `nvidia-smi` + Nsight Systems | ✅ `intel_gpu_top` + VTune | ✅ `rocm-smi`/`radeontop` + RGP | n/a |
| macOS arm64 | n/a | n/a | n/a | ✅ Instruments + `powermetrics` + `ioreg` |

`✅` = full live-counters + deep-capture. Other combos = best-effort or n/a.

**H2. Live GPU counter polling.** `tools/profiler/gpu/poller.js` runs in the Electron main process whenever an FFmpeg child is alive. Polls at 1 Hz, emits `gpu.sample` span events on the active `ffmpeg.process` span.

Common attributes on every `gpu.sample` event:
```
gpu.vendor          "nvidia" | "intel" | "amd" | "apple"
gpu.utilization     0..100  (graphics engine %)
gpu.encoder.utilization   0..100  (encoder engine %)
gpu.memory.used.bytes
gpu.memory.total.bytes
gpu.power.watts
gpu.temperature.c
gpu.clock.graphics.mhz
pcie.rx.bytes_per_sec      (should be near zero when the CUDA fast path is active)
pcie.tx.bytes_per_sec
```

**H3. NVIDIA — Windows + Linux.** Live counters via `nvidia-smi --query-gpu=… --format=csv,noheader,nounits -lms 1000` (streaming CSV every 1 s, zero deps). For PCIe traffic: `nvidia-smi dmon -s u`. Parse both into `gpu.sample` events.

Deep capture: `nsys profile --trace=cuda,nvtx,osrt,opengl,d3d11 --output=dev/profiles/nvidia-<ts>.nsys-rep ffmpeg <argv>`. What this confirms: whether `hwmap=derive_device=cuda:mode=read` is mapping (zero-copy) or copying (PCIe traffic) — the primary validation for Plan 01 (if still relevant) and the baseline for Plan 02's encoder timing.

**H4. Intel — Windows + Linux.** Live counters: Linux via `intel_gpu_top -J -s 1000` (JSON, per-engine utilization including Video engine = QSV). Windows via PresentMon (`gpu_video_busy`). Deep capture: VTune `-collect gpu-hotspots`.

**H5. AMD — Windows + Linux.** Live counters: Linux via `rocm-smi --json` (fallback to `radeontop`). Windows via PresentMon. Deep capture: Radeon GPU Profiler (requires AMD Developer Mode driver).

**H6. Apple — macOS arm64.** Live counters: `powermetrics --samplers gpu_power -i 1000` (requires sudo once) + `ioreg -c AppleAVD` for VideoToolbox encoder queue depth. Deep capture: `xctrace record --template "Metal System Trace" --output dev/profiles/apple-<ts>.trace --launch -- ffmpeg <argv>`.

**H7. PresentMon as cross-vendor truth on Windows.** Always run alongside vendor-specific tool on Windows. Provides frame-pacing data (frame time, GPU active time) in a uniform CSV regardless of vendor.

**H8. FFmpeg verbose stats parsing.** Set `-loglevel verbose -stats -vstats_file dev/profiles/ffmpeg-vstats-<ts>.csv`. The Phase E1 FFmpeg wrapper also parses vendor-specific log patterns (`[h264_nvenc @ …]`, `[h264_qsv @ …]`, `[h264_amf @ …]`, `[h264_videotoolbox @ …]`) and surfaces encoder init params as `ffmpeg.process` span attributes.

**H9. `pnpm profile:gpu` orchestrator.** `tools/profiler/gpu/cli.js`:

```
pnpm profile:gpu                               # auto-detect vendor
pnpm profile:gpu --vendor=nvidia               # force vendor
pnpm profile:gpu --no-deep                     # live counters only
pnpm profile:gpu --duration=30                 # cap duration
pnpm profile:gpu --target-fps=60 --resolution=1920x1080  # synthetic test source
```

On exit: prints all artifact paths and offers to open them.

---

## Code organization & implementation notes

```
tools/profiler/
  package.json                                   -- internal workspace pkg
  README.md

  otel/
    bootstrapNode.js                             -- shared OTel SDK setup for Node procs
    main.bootstrap.js                            -- service.name = rebound-main
    server.bootstrap.js                          -- service.name = rebound-server
    renderer.bootstrap.js                        -- WebTracerProvider + browser instrs
    vite-plugin.js                               -- conditional inject of renderer bootstrap
    util.js                                      -- withSpan / withSpanAsync
    serviceNames.js                              -- service name constants (one rename = one file)
    instrumentation/
      ipc.js                                     -- instrumentIpcMain / instrumentIpcRenderer
      ffmpeg.js                                  -- wrapSpawn(spawn)
      reactProfiler.jsx                          -- <ProfileScope>
      runtimeMetrics.js                          -- 1 Hz RSS / heap / loop lag

  inspector/
    cpu.js                                       -- recordCpuProfile()
    heap.js                                      -- recordHeapSnapshot()
    cli.js                                       -- pnpm profile:cpu / profile:heap entry
    debugServer.js                               -- 127.0.0.1:9876/9877 debug endpoints

  gpu/
    poller.js                                    -- live GPU counter dispatcher
    cli.js                                       -- pnpm profile:gpu entry
    detect.js                                    -- thin wrapper over Plan 04 capability probe
    backends/
      nvml.js                                    -- nvidia-smi CSV parser
      intelGpuTop.js                             -- intel_gpu_top -J parser
      rocmSmi.js                                 -- rocm-smi JSON polling
      radeontop.js                               -- radeontop fallback for non-ROCm AMD
      presentmon.js                              -- Windows cross-vendor PresentMon CSV parser
      powermetrics.js                            -- macOS powermetrics parser
      ioreg.js                                   -- macOS ioreg AppleAVD sampler
    deepCapture/
      nsight.js                                  -- nsys profile wrapper (NVIDIA)
      vtune.js                                   -- vtune -collect gpu-hotspots (Intel)
      rgp.js                                     -- Radeon GPU Profiler launcher
      xctrace.js                                 -- xctrace Metal System Trace (Apple)
    ffmpegStats.js                               -- vstats CSV + vendor log parser

  bin/
    launch.js                                    -- pnpm run profile orchestrator
    jaeger.js                                    -- start/stop helpers (docker + binary fallback)

  __tests__/
    bootstrapNode.test.js
    instrumentationIpc.test.js
    instrumentationFfmpeg.test.js
    util.test.js
    nvmlParser.test.js
    intelGpuTopParser.test.js
    rocmSmiParser.test.js
    presentMonParser.test.js
    powermetricsParser.test.js
    ffmpegStats.test.js
    fixtures/
      ffmpeg-stderr.txt
      ffmpeg-stderr-nvenc.txt
      ffmpeg-stderr-qsv.txt
      ffmpeg-stderr-amf.txt
      ffmpeg-stderr-videotoolbox.txt
      ffmpeg-vstats.csv
      nvidia-smi-query.csv
      nvidia-smi-dmon.txt
      intel-gpu-top.json
      rocm-smi.json
      presentmon.csv
      powermetrics.txt
```

### Architectural rules

- **OTel SDK loaded once per process via `--import` flag.** Application code imports `@opentelemetry/api` (API package, decoupled from SDK, no-op when no SDK registered).
- **Auto-instrumentation > custom.** Only IPC, FFmpeg, and React get custom code.
- **Custom wrappers degrade to identity when OTel is off.** `wrapSpawn(spawn)` returns `spawn` itself. `instrumentIpcMain(ipcMain)` is a no-op. Zero behavioral change when off.
- **Inspector and OTel are independent.** `pnpm profile:cpu` works whether or not OTel is enabled.

### Testing strategy

- **Bootstrap** — call `startOtel({ serviceName: "test" })` with `OTEL_TRACES_EXPORTER=otlp` and an in-memory span exporter. Assert span exported with correct service name.
- **IPC wrapper** — fake `ipcMain` and `ipcRenderer`. Wrap both. Invoke a channel with an active span on the renderer side. Assert the main-side handler runs with the same trace ID.
- **FFmpeg wrapper** — pipe `fixtures/ffmpeg-stderr.txt` through stderr. Assert correct sequence of `addEvent` calls.
- **CPU profile** — call `recordCpuProfile({ durationMs: 200, outFile: tmp })`. Assert file exists, parses as JSON, has `nodes` array.
- **Off-by-default** — boot without `OTEL_TRACES_EXPORTER`. Generate 1000 spans. Assert no network traffic, no exporter activity.
- **GPU parsers** — each is a pure function `(text) => GpuSample[]`, tested against canned fixtures. No GPU hardware required.

## Migration & rollout

- **Phase A (Jaeger backend):** Pure infrastructure. No code changes anywhere else. Ships first.
- **Phase B (Node bootstraps):** Adds OTel deps, two bootstrap files. Importable but not loaded by production. Verify with `pnpm run profile:server`.
- **Phase C (renderer bootstrap + Vite plugin):** Same shape. Verify with `pnpm run profile:renderer`.
- **Phase D (HTTP + IPC propagation):** HTTP is free with B+C. IPC is the one custom piece. After this, end-to-end traces (renderer click → server response) work.
- **Phase E (FFmpeg + React + runtime metrics):** Independent of the others; each can land separately.
- **Phase F (CPU/heap profiles):** No dependency on OTel.
- **Phase G (`pnpm run profile` orchestrator):** Ships last. Ties it all together.
- **Phase H (GPU profiling):** Ships piecewise per vendor:
  1. Live counters: NVIDIA Linux/Windows (`nvidia-smi`) — covers most users; one PR.
  2. Live counters: Intel Linux (`intel_gpu_top`) and Apple (`powermetrics`).
  3. Live counters: AMD Linux (`rocm-smi` + `radeontop` fallback).
  4. Live counters: Windows cross-vendor via PresentMon.
  5. FFmpeg vendor-specific stats parsing (NVENC/QSV/AMF/VideoToolbox) — one shared PR.
  6. Deep capture wrappers — one PR per vendor.
  7. `pnpm profile:gpu` orchestrator — last.

## Validation

- **Phase A:** `pnpm run profile` brings Jaeger up; `curl http://127.0.0.1:16686/` returns 200 within 5 s.
- **Phase B:** Run server with `OTEL_TRACES_EXPORTER=otlp`. Hit `GET /api/csrf` 100 times. Jaeger shows 100 traces, each with one Express span. Steady-state RSS within 1% of pre-plan baseline when OTel is off.
- **Phase C:** Open renderer with `VITE_OTEL_ENABLED=1`. Jaeger shows `documentLoad` and `user.click` spans.
- **Phase D — HTTP:** Click a fetch action. Jaeger shows one root in `rebound-renderer` with child in `rebound-server`.
- **Phase D — IPC:** Click "Start streaming." Trace shows renderer → main → server chain (see Phase D3 expected trace).
- **Phase E — FFmpeg:** Stream for 30 seconds. Jaeger shows one `ffmpeg.process` span with N `status` events and one `segment.write` event per segment.
- **Phase F — CPU profile:** `pnpm profile:cpu --target=main --duration=5` produces a `.cpuprofile` openable in Chrome DevTools Performance tab with a visible flame graph.
- **Phase G — orchestrator:** `pnpm run profile` on macOS, Windows, and Linux opens Jaeger automatically. Ctrl-C cleans up all child processes (no orphan Electron, FFmpeg, Vite, or Jaeger container).
- **End-to-end:** `pnpm run profile` → Start streaming → Stop streaming (30 s) → Jaeger trace rooted at start click spans all three services with consistent timestamps.
- **Phase H — NVIDIA live counters:** Stream 30 s on NVIDIA GPU. `ffmpeg.process` span shows ≥ 25 `gpu.sample` events with non-zero `gpu.encoder.utilization`. Verify `pcie.rx.bytes_per_sec` is near zero (confirming the CUDA fast path is active).
- **Phase H — GPU parsers:** All canned vendor log fixtures produce correct `gpu.sample` events in pure unit tests, no GPU hardware required.
- **Phase H — deep capture (NVIDIA):** With Nsight Systems installed, `pnpm profile:gpu --vendor=nvidia --duration=10` produces a `.nsys-rep` that opens in `nsys-ui` with a CUDA timeline.
- **Phase H — graceful degradation:** `pnpm profile:gpu` on a machine without the vendor's deep-capture tool falls back to live counters and prints a one-paragraph install hint. No crash.
