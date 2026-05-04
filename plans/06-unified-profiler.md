# Plan 06: Unified observability with OpenTelemetry + Jaeger across renderer, main, and server (plus on-demand CPU/heap profiles)

## Problem

The codebase has three distinct JavaScript execution contexts and none of them are profileable today without ad-hoc, manual work:

1. **The Electron renderer** (`src/`, Vite-served React app). Can be poked with Chrome DevTools' Performance tab, but only through the renderer's own DevTools window, and the data does not connect to anything else in the system.
2. **The Electron main process** (`public/electron.js`, `public/electron-live-stream.js`, `public/streaming/*`). This is where the streaming pipeline orchestrator lives — IPC handlers, FFmpeg subprocess spawn/manage, HLS upload loop, session bookkeeping. Today it has no profiling at all. The closest thing is `console.log` and `electron-log`.
3. **The backend server** (`server/src/`). Express 5 + Mongoose + Socket.IO + the live HLS ingest. Today: `morgan` request logs and `winston` info logs. No request-time histograms, no per-handler hot-path data.

When something gets slow — a stream upload pass takes 600 ms instead of 200 ms, an IPC roundtrip stalls the renderer, a CSRF middleware blocks for a strange reason — there is no unified place to see it. The streaming-related plans in this folder (01–05) all care about latency and per-stage timing; they reference numbers like "GPU readback ~475 MB/s" or "upload pass duration" but the code emits none of those numbers in a structured form. We measure those things ad hoc in shell, in our heads, in plt-style hand-printed timestamps.

We need a profiler that:

- **Spans all three execution contexts** (renderer, main, server) on a single timeline.
- **Hooks in for free in dev** — running `pnpm run profile` should be the entire setup.
- **Has manual control surfaces** — start/stop CPU profile, take heap snapshot, plus arbitrary span recording from any line of code in any process.
- **Has minimal manual code intrusion** — by default, HTTP requests, Express routes, Mongoose queries, Socket.IO, fetch, IPC calls, and FFmpeg lifecycle events show up automatically. Sprinkling `tracer.startActiveSpan("buildHls", fn)` adds detail in one line.
- **Costs nothing when off.** Production builds and normal `pnpm run electron-dev` should not pay a cycle for any of it.
- **Uses an industry-standard format and viewer** so we can throw a flame chart at any colleague (or at any cloud APM later) without explaining a custom file format.

## Why this should be fixed

- Plan 01 ("eliminate GPU → CPU round trip"), Plan 03 ("parallel streaming uploads"), Plan 04 ("tune VBV bufsize") all hinge on numbers we cannot currently measure. Without profiling, "did it actually get faster?" is a vibe check.
- Plan 05 talks about a Live Status panel and stream health widget — both are downstream consumers of structured timing data that we are not collecting.
- The streaming hot path involves four hops (renderer click → IPC → FFmpeg spawn → HLS upload → server validate → storage), and any one of them can be the culprit when latency rises. Distributed tracing — a renderer span as the root, a main-process IPC span as its child, a server-side HTTP span as its grandchild, all in one waterfall — is the only correct way to localize the culprit.
- Heap usage during long streams is unmonitored. Memory leaks today are noticed when the user complains.
- A new contributor cannot answer "what is the slow part of the app?" without instrumenting from scratch every time.

## Expected result

After this plan ships:

- `pnpm run profile` does the entire setup: starts a local **Jaeger** backend (single Docker container, or a fallback to the all-in-one binary), starts the Vite renderer, the Electron main process, and the backend server, all with OpenTelemetry tracing enabled (env: `OTEL_TRACES_EXPORTER=otlp`, `OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:4318`). Then opens `http://127.0.0.1:16686` (Jaeger UI) in the default browser.
- The Jaeger UI shows three services: `rebound-renderer`, `rebound-main`, `rebound-server`. Searches by service, operation, tag, duration. Drilling into any trace shows a timeline waterfall across all three.
- A click in the renderer that fires `live-stream:start` over IPC and triggers a server `POST /live/api/session` shows up as **one trace with one root span**, with child spans across all three processes. Trace context propagates via W3C `traceparent` (HTTP) and via a small custom IPC propagator we add.
- Auto-instrumentations cover, with no per-handler edits:
  - Express routes (operation = `<METHOD> <route>`, status, duration, size)
  - Outbound HTTP/fetch (operation = `<METHOD> <host><path>`)
  - Mongoose queries (collection, op, duration)
  - Socket.IO frames
  - DNS lookups
  - File I/O (opt-in, off by default — too noisy on by default)
- **Custom-but-thin** instrumentations (the things OTel does not ship out of the box):
  - **Electron IPC** — every `ipcMain.handle/on` call becomes a span; trace context flows from renderer to main.
  - **FFmpeg subprocess** — one long-lived span per FFmpeg run, with stderr-parsed `frame/fps/speed/dropped/time` attributes, plus child events for per-segment writes.
  - **React** — `<Profiler>` integration emits commit/render spans for top-level routes.
- A developer can write, anywhere in any of the three contexts:
  ```js
  import { trace } from "@opentelemetry/api";
  const tracer = trace.getTracer("rebound");

  tracer.startActiveSpan("uploadSegment", async (span) => {
    span.setAttribute("size", buf.length);
    try {
      const result = await uploader.put(seg);
      span.setAttribute("status", result.status);
      return result;
    } finally {
      span.end();
    }
  });
  ```
  ...and that span shows up in Jaeger under the `rebound-main` service, parented to whatever span was active when it started.
- All of the above is **off by default**. When `OTEL_TRACES_EXPORTER` is unset (or set to `none`), the OTel SDK installs a no-op tracer; auto-instrumentations install but never emit; the cost is one allocation at startup and ~tens of nanoseconds per `startActiveSpan` call (well within "free for the developer"). `pnpm run electron-dev` does not start Jaeger and does not enable tracing.
- A separate orthogonal pair of commands captures **on-demand CPU profiles and heap snapshots** via Node's built-in inspector — these are the standard `.cpuprofile` and `.heapsnapshot` files that drag-and-drop into Chrome DevTools (Performance tab and Memory tab respectively):
  - `pnpm profile:cpu --target=main --duration=5` → writes `dev/profiles/main-2026-05-04T20-13-47.cpuprofile`
  - `pnpm profile:heap --target=server` → writes `dev/profiles/server-…heapsnapshot`
- For the GPU side of the streaming pipeline (the encoder, capture, and PCIe traffic that Plans 01–04 care about) a third orthogonal command captures **per-vendor GPU profiles** that automatically pick the right tool per platform and architecture:
  - `pnpm profile:gpu` — auto-detects NVIDIA / Intel / AMD / Apple, polls live counters into the OTel trace at 1 Hz (encoder engine %, VRAM, PCIe traffic, power, temp, clocks), and optionally wraps FFmpeg under the vendor's deep profiler:
    - **NVIDIA (Windows + Linux x86_64):** Nsight Systems (`.nsys-rep`); live counters via `nvidia-smi` / `nvidia-smi dmon` for PCIe RX/TX
    - **Intel (Linux):** `intel_gpu_top -J` live + Intel VTune `gpu-hotspots` deep capture
    - **Intel / AMD (Windows):** Microsoft PresentMon (cross-vendor frame timing + encoder engine %) plus VTune (Intel) or RGP (AMD)
    - **AMD (Linux):** `rocm-smi --json` (with `radeontop` fallback); RGP deep capture when AMD Developer Mode driver is enabled
    - **Apple Silicon (macOS arm64):** `powermetrics --samplers gpu_power` + `ioreg -c AppleAVD` for VideoToolbox queue depth; Instruments / Metal System Trace via `xctrace record --template "Metal System Trace"` for deep capture
  - All vendor counters land as span events on the same `ffmpeg.process` OTel span, so the developer sees CPU-side and GPU-side data on a single Jaeger trace timeline. Vendor-specific deep-capture artifacts open in their respective vendor GUIs (Nsight Systems, VTune, RGP, Instruments).

## How to fix

This plan is broken into 7 phases. A is the local Jaeger backend; B–D add tracing in each context; E is custom span emitters for what OTel doesn't auto-cover; F is the on-demand CPU/heap commands (orthogonal to OTel); G is the dev-UX glue that ties it all behind `pnpm run profile`.

---

### Phase A — Local Jaeger backend (the "profiler website")

Jaeger is the canonical open-source distributed tracing UI: CNCF graduated, Apache 2.0, used at scale at Uber, Microsoft, Cloudflare, etc. **Jaeger v2** is built on top of the OpenTelemetry Collector, so it speaks OTLP natively (no separate collector deployment, no Jaeger-format conversion).

**A1. Choose the run mode.** Two modes, picked at runtime:

- **Docker mode (preferred when available):** `docker run --rm -d --name rebound-jaeger -p 16686:16686 -p 4317:4317 -p 4318:4318 jaegertracing/jaeger:2.0.0` — single container exposing the UI on 16686, OTLP/gRPC on 4317, OTLP/HTTP on 4318. Storage is in-memory by default, perfect for dev.
- **Binary fallback (no Docker required):** Jaeger ships a single static binary (`jaeger-2.x.x-{darwin,linux,windows}-{amd64,arm64}`) on its GitHub releases page. The orchestrator (Phase G) downloads it once into `dev/bin/jaeger` (gitignored), caches it, and runs it directly with the equivalent flags.

The orchestrator probes `docker ps` and falls back to the binary if Docker is not available. Either way, the developer never touches it.

**A2. CORS and ports.** The renderer is a browser context and posts OTLP/HTTP from `http://localhost:3000` to `http://127.0.0.1:4318/v1/traces`. Jaeger v2's bundled collector accepts OTLP/HTTP and is configured with permissive CORS for localhost origins via env vars baked into our run command:

```
COLLECTOR_OTLP_HTTP_CORS_ALLOWED_ORIGINS=http://localhost:3000,app://-
COLLECTOR_OTLP_HTTP_CORS_ALLOWED_HEADERS=*
```

(Exact env var names will be locked in during implementation; they may move between Jaeger versions. The orchestrator pins to a specific Jaeger version so this is a one-time check.)

**A3. UI.** Jaeger UI at `http://127.0.0.1:16686` provides:

- Search by service, operation, tag, duration, time range.
- Trace timeline view: waterfall of nested spans with attributes, events, logs.
- Service dependency graph — auto-derived from cross-service spans, gives the "renderer → main → server" picture for free.
- Trace comparison view — diff two traces span-by-span (e.g. before/after a Plan 04 change).

**A4. Lifecycle.** The Jaeger backend is a single process owned by the orchestrator (Phase G). It starts when `pnpm run profile` starts and stops on Ctrl-C. Trace data is in-memory, so it dies with the process — fine for dev.

---

### Phase B — OpenTelemetry SDK in the Node processes (server + Electron main)

Both the server and the Electron main process are Node runtimes. They use the same SDK (`@opentelemetry/sdk-node`) and the same auto-instrumentation pack (`@opentelemetry/auto-instrumentations-node`).

**B1. Dependencies.** Added to root `package.json`:

```jsonc
{
  "dependencies": {
    "@opentelemetry/api": "^1.x",
    "@opentelemetry/sdk-node": "^0.x",
    "@opentelemetry/auto-instrumentations-node": "^0.x",
    "@opentelemetry/exporter-trace-otlp-proto": "^0.x",
    "@opentelemetry/resources": "^1.x",
    "@opentelemetry/semantic-conventions": "^1.x"
  }
}
```

(Exact versions pinned during implementation; we use `^` because the OTel API is stable but the SDK is still 0.x for individual packages.)

**B2. Bootstrap modules.** Two near-identical files:

- `tools/profiler/otel/main.bootstrap.js` — bootstrap for the Electron main process (service.name = `rebound-main`).
- `tools/profiler/otel/server.bootstrap.js` — bootstrap for the backend server (service.name = `rebound-server`).

Both build on a shared helper:

```js
// tools/profiler/otel/bootstrapNode.js
import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { Resource } from "@opentelemetry/resources";
import { SemanticResourceAttributes } from "@opentelemetry/semantic-conventions";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";

export function startOtel({ serviceName, instanceId = String(process.pid) }) {
  if (process.env.OTEL_TRACES_EXPORTER === "none" || !process.env.OTEL_TRACES_EXPORTER) {
    // Off by default.
    return null;
  }

  const sdk = new NodeSDK({
    resource: new Resource({
      [SemanticResourceAttributes.SERVICE_NAME]: serviceName,
      [SemanticResourceAttributes.SERVICE_INSTANCE_ID]: instanceId,
      [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: "development",
    }),
    traceExporter: new OTLPTraceExporter({
      url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT
        ? `${process.env.OTEL_EXPORTER_OTLP_ENDPOINT}/v1/traces`
        : "http://127.0.0.1:4318/v1/traces",
    }),
    instrumentations: [getNodeAutoInstrumentations({
      "@opentelemetry/instrumentation-fs": { enabled: false }, // too noisy by default
    })],
  });

  sdk.start();
  process.once("SIGTERM", () => sdk.shutdown().catch(() => {}));
  process.once("SIGINT",  () => sdk.shutdown().catch(() => {}));
  return sdk;
}
```

Then `main.bootstrap.js` is one line:

```js
import { startOtel } from "./bootstrapNode.js";
startOtel({ serviceName: "rebound-main" });
```

**B3. Critical: load order.** OTel auto-instrumentation works by patching modules **at require/import time**. The bootstrap must run before any other module is loaded. We achieve this by:

- For the server, prepending `--import=./tools/profiler/otel/server.bootstrap.js` (Node ≥ 20.6) or `--require=./tools/profiler/otel/server.bootstrap.cjs` to the `pnpm profile:server` command. Note `server/src/app.js` continues to be the application entrypoint; the bootstrap is a separate side-effect module loaded via the flag.
- For Electron main, the same flag passed to the Electron Node binary: `electron --import=./tools/profiler/otel/main.bootstrap.js .`

Both flags are only used in the profiling scripts. `pnpm run electron-dev` does not pass them, so the SDK never initializes and the auto-instrumentations never patch anything. **Zero overhead when off.**

**B4. Off-by-default semantics.** Three layers of off-switch:

1. The bootstrap itself early-returns when `OTEL_TRACES_EXPORTER` is unset — so even if it accidentally gets imported, nothing starts.
2. `pnpm run electron-dev` (and `pnpm run dev` in `server/`) does not pass `--import=…bootstrap.js`, so the bootstrap is never even imported.
3. Production builds (`pnpm run dist`) have no path that imports the bootstrap.

**B5. Auto-instrumentation coverage.** `@opentelemetry/auto-instrumentations-node` includes (at the time of writing): http, https, net, dns, fs (we disable), express, koa, fastify, hapi, mongoose, mongodb, redis, mysql, pg, ioredis, socket.io, grpc, kafkajs, undici (covers Node fetch). What we get for free:

- **Server:** every Express route → span; every Mongoose query → child span; every Socket.IO frame → span.
- **Main:** every Node `fetch()` (the upload loop in Plan 03 cares about this) → span; outgoing HTTP requests → span.

Anything not in that list (Electron IPC, FFmpeg lifecycle, React renders) we cover in Phase E.

**B6. Sampler.** Default sampler is `AlwaysOnSampler` in dev — we want every trace. In a future production-observability plan, switch to `ParentBasedSampler({ root: TraceIdRatioBasedSampler(0.01) })`.

---

### Phase C — OpenTelemetry SDK in the renderer

The renderer is a browser context. OpenTelemetry has a separate SDK for browsers: `@opentelemetry/sdk-trace-web`.

**C1. Dependencies.** Added to root `package.json`:

```jsonc
{
  "dependencies": {
    "@opentelemetry/sdk-trace-web": "^1.x",
    "@opentelemetry/context-zone": "^1.x",
    "@opentelemetry/exporter-trace-otlp-http": "^0.x",
    "@opentelemetry/instrumentation": "^0.x",
    "@opentelemetry/instrumentation-fetch": "^0.x",
    "@opentelemetry/instrumentation-xml-http-request": "^0.x",
    "@opentelemetry/instrumentation-document-load": "^0.x",
    "@opentelemetry/instrumentation-user-interaction": "^0.x"
  }
}
```

**C2. Bootstrap.** `tools/profiler/otel/renderer.bootstrap.js`:

```js
import { WebTracerProvider } from "@opentelemetry/sdk-trace-web";
import { ZoneContextManager } from "@opentelemetry/context-zone";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { Resource } from "@opentelemetry/resources";
import { SemanticResourceAttributes } from "@opentelemetry/semantic-conventions";
import { registerInstrumentations } from "@opentelemetry/instrumentation";
import { FetchInstrumentation } from "@opentelemetry/instrumentation-fetch";
import { XMLHttpRequestInstrumentation } from "@opentelemetry/instrumentation-xml-http-request";
import { DocumentLoadInstrumentation } from "@opentelemetry/instrumentation-document-load";
import { UserInteractionInstrumentation } from "@opentelemetry/instrumentation-user-interaction";

if (import.meta.env.VITE_OTEL_ENABLED === "1") {
  const provider = new WebTracerProvider({
    resource: new Resource({
      [SemanticResourceAttributes.SERVICE_NAME]: "rebound-renderer",
      [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: "development",
    }),
    spanProcessors: [
      new BatchSpanProcessor(new OTLPTraceExporter({
        url: import.meta.env.VITE_OTEL_EXPORTER_OTLP_ENDPOINT
          ? `${import.meta.env.VITE_OTEL_EXPORTER_OTLP_ENDPOINT}/v1/traces`
          : "http://127.0.0.1:4318/v1/traces",
      })),
    ],
  });

  provider.register({ contextManager: new ZoneContextManager() });

  registerInstrumentations({
    instrumentations: [
      new DocumentLoadInstrumentation(),
      new UserInteractionInstrumentation({ eventNames: ["click", "submit"] }),
      new XMLHttpRequestInstrumentation({
        propagateTraceHeaderCorsUrls: [/^https?:\/\/(127\.0\.0\.1|localhost):/],
      }),
      new FetchInstrumentation({
        propagateTraceHeaderCorsUrls: [/^https?:\/\/(127\.0\.0\.1|localhost):/],
      }),
    ],
  });
}
```

**C3. Vite plugin / build-time gate.** A small Vite plugin (`tools/profiler/otel/vite-plugin.js`):

- Reads `process.env.VITE_OTEL_ENABLED` from the build environment.
- When `=1`: injects `import "tools/profiler/otel/renderer.bootstrap.js";` into `src/index.jsx` virtually, before anything else in the bundle.
- When unset: the plugin is a no-op; the OTel renderer SDK is **not bundled at all**, so production bundles do not pay any size cost. Verifiable by inspecting the production `build/` output.

The plugin is only added in `vite.config.js` when `process.env.VITE_OTEL_ENABLED === "1"`.

**C4. What we get for free.**

- `documentLoad` — a top-level span per page load with timing breakdown (DNS, TCP, TLS, request, response, DOMContentLoaded, load).
- `userInteraction` — every click and form submit is a span; subsequent fetches/XHRs spawned by that interaction become children, so we get end-to-end traces rooted at user actions.
- `fetch` and `xmlHttpRequest` — every API call from the renderer is a span. The `propagateTraceHeaderCorsUrls` setting injects `traceparent` headers on calls to localhost, which the server-side auto-instrumentation reads, so a click → fetch → server-side handler shows as one trace.

**C5. What is not covered (covered in Phase E).** React renders, Electron IPC calls. We add those as one-line wrappers.

---

### Phase D — Distributed trace context across HTTP, IPC, and FFmpeg

This is the glue that makes a click in the renderer light up a span tree across all three services in Jaeger.

**D1. HTTP propagation (free).** The renderer's `FetchInstrumentation` (Phase C) injects W3C `traceparent` headers on outgoing fetches. The server's `HttpInstrumentation` (Phase B, transitive) extracts the header and treats the new server span as a child of the renderer's span. Renderer↔Server propagation: zero work.

**D2. Electron IPC propagation (custom, ~50 lines).** OpenTelemetry has no built-in instrumentation for `ipcRenderer`/`ipcMain`. We add `tools/profiler/otel/instrumentation/ipc.js`:

```js
// renderer side: wraps ipcRenderer.invoke
import { context, propagation, trace } from "@opentelemetry/api";

export function instrumentIpcRenderer(ipcRenderer) {
  const original = ipcRenderer.invoke.bind(ipcRenderer);
  const tracer = trace.getTracer("rebound-ipc");
  ipcRenderer.invoke = (channel, ...args) => {
    return tracer.startActiveSpan(`ipc.invoke ${channel}`, async (span) => {
      const carrier = {};
      propagation.inject(context.active(), carrier);
      try {
        return await original(channel, { __otel: carrier, payload: args });
      } finally {
        span.end();
      }
    });
  };
}

// main side: wraps ipcMain.handle / ipcMain.on / ipcMain.once
export function instrumentIpcMain(ipcMain) {
  const tracer = trace.getTracer("rebound-ipc");
  for (const method of ["handle", "on", "once"]) {
    const original = ipcMain[method].bind(ipcMain);
    ipcMain[method] = (channel, listener) => {
      return original(channel, async (event, payload) => {
        const carrier = payload?.__otel || {};
        const incomingCtx = propagation.extract(context.active(), carrier);
        return context.with(incomingCtx, () => {
          return tracer.startActiveSpan(`ipc.${method} ${channel}`, async (span) => {
            try {
              return await listener(event, ...(payload?.payload || []));
            } finally {
              span.end();
            }
          });
        });
      });
    };
  }
}
```

The wire format change (`{ __otel, payload }` instead of just `payload`) is hidden behind the wrapper on both sides. Application code never sees it. The wrappers are no-ops when `OTEL_TRACES_EXPORTER === "none"` (or absent) — they fall back to the un-wrapped `invoke`/`handle` behavior so that the IPC argument shape is unchanged when tracing is off.

**D3. Verification.** With Phase D wired up, this trace should appear in Jaeger when the user clicks "Start streaming":

```
rebound-renderer  user.click handle-start-stream            120 ms
└─ rebound-renderer  ipc.invoke live-stream:start            118 ms
   └─ rebound-main      ipc.handle live-stream:start         115 ms
      ├─ rebound-main      fetch POST /live/api/session       42 ms
      │  └─ rebound-server  POST /live/api/session             40 ms
      │     ├─ rebound-server  mongoose StreamSession.create   12 ms
      │     └─ rebound-server  mongoose StreamSession.save      6 ms
      └─ rebound-main      ffmpeg.process                    72 ms (ongoing)
```

That trace, in Jaeger, viewable at one URL, with one click — is the entire point of this plan.

---

### Phase E — Custom span emitters (FFmpeg, React, the things OTel does not auto-instrument)

This is the same shape as Plan 06's old "instrumentations" phase, but speaking OpenTelemetry's API instead of a custom one. The total is ~200 lines.

**E1. FFmpeg subprocess instrumentation.** `tools/profiler/otel/instrumentation/ffmpeg.js` exports `wrapSpawn(spawn)`. It returns a `spawn`-shaped function that:

- Detects `command.endsWith("ffmpeg")` (or `ffmpeg.exe`) and treats it specially.
- Opens a long-lived span `ffmpeg.process` with attributes `{ "ffmpeg.args": args.join(" "), "ffmpeg.pid": child.pid }`.
- Subscribes to stderr, parses FFmpeg's status lines (`frame=… fps=… time=… speed=…`) and sets attributes / span events:
  - Per status line: `span.addEvent("status", { fps, speed, dropped, frame, time })`.
  - On any stderr line containing `Opening ‘…’ for writing` (per-segment): `span.addEvent("segment.write", { filename })`.
- Watches the process's working directory for new segment files (matches Plan 05's HLS output shape) and emits `segment.ready` events.
- On exit, sets `{ "ffmpeg.exit_code", "ffmpeg.signal" }` and ends the span.

Use site, `public/electron-live-stream.js`:

```js
import { spawn as rawSpawn } from "child_process";
import { wrapSpawn } from "../tools/profiler/otel/instrumentation/ffmpeg.js";
const spawn = wrapSpawn(rawSpawn);    // identity when OTel disabled
```

**E2. React Profiler bridge.** `tools/profiler/otel/instrumentation/reactProfiler.jsx` exports `<ProfileScope id="…">`, a thin wrapper around React's `<Profiler>`:

```jsx
import { Profiler } from "react";
import { trace } from "@opentelemetry/api";

const tracer = trace.getTracer("rebound-react");

export function ProfileScope({ id, children }) {
  if (import.meta.env.VITE_OTEL_ENABLED !== "1") return children;
  return (
    <Profiler id={id} onRender={(profileId, phase, actualDuration) => {
      const span = tracer.startSpan(`react.${profileId}.${phase}`, {
        startTime: performance.now() - actualDuration,
      });
      span.setAttribute("react.actualDuration", actualDuration);
      span.end();
    }}>
      {children}
    </Profiler>
  );
}
```

Used in `src/App.jsx` to wrap top-level routes. Optional, not required.

**E3. Process-level metrics (RSS, heap, event-loop lag).** OTel's `@opentelemetry/host-metrics` ships system metrics (CPU, memory) but doesn't include event-loop lag. We add a tiny module `tools/profiler/otel/instrumentation/runtimeMetrics.js` that uses `perf_hooks.monitorEventLoopDelay` + `process.memoryUsage()` and emits them as **span events** on a 1 Hz heartbeat span (`runtime.heartbeat`) per process.

Alternative considered: emit as OTel **metrics** (the OTel Metrics API). Decision: stick with span events for now because Jaeger displays them inline in the trace timeline. A future plan can graduate these to first-class metrics with Prometheus + Grafana.

**E4. Manual API.** No new API: developers use the official OTel API directly. One-line examples:

```js
import { trace } from "@opentelemetry/api";
const tracer = trace.getTracer("rebound-streaming");

// Wrap a sync function
const result = tracer.startActiveSpan("computeFoo", (span) => {
  try { return doExpensiveWork(); } finally { span.end(); }
});

// Wrap an async function
const data = await tracer.startActiveSpan("uploadSegment", async (span) => {
  span.setAttribute("size", buf.length);
  try { return await uploader.put(seg); } finally { span.end(); }
});

// Manual control
const span = tracer.startSpan("renderFrame", { attributes: { fps: 60 } });
// ... work ...
span.setAttribute("droppedFrames", 0);
span.end();
```

This is the standard OTel API — every OTel tutorial on the internet is also documentation for our codebase.

**E5. A tiny convenience helper (optional).** For folks who hate the `try/finally` boilerplate, `tools/profiler/otel/util.js` exports `withSpan(name, fn, attrs?)` and `withSpanAsync(name, fn, attrs?)`:

```js
export function withSpan(name, fn, attrs) {
  return tracer.startActiveSpan(name, attrs ? { attributes: attrs } : {}, (span) => {
    try { return fn(span); }
    catch (e) { span.recordException(e); span.setStatus({ code: 2 }); throw e; }
    finally { span.end(); }
  });
}
```

Pure ergonomics; the OTel API is the source of truth.

---

### Phase F — On-demand CPU profiles and heap snapshots (orthogonal to OTel)

OpenTelemetry doesn't do CPU/heap profiles — those are a different layer of observability (sampling profilers vs structured event tracing). For local dev, Node's built-in `node:inspector` module covers this perfectly with no extra deps.

**F1. The wrapper.** `tools/profiler/inspector/cpu.js` and `tools/profiler/inspector/heap.js` are thin:

```js
import inspector from "node:inspector";
import { promises as fs } from "fs";

export async function recordCpuProfile({ durationMs, outFile }) {
  const session = new inspector.Session();
  session.connect();
  await new Promise((r) => session.post("Profiler.enable", r));
  await new Promise((r) => session.post("Profiler.start", r));
  await new Promise((r) => setTimeout(r, durationMs));
  const { profile } = await new Promise((r, j) =>
    session.post("Profiler.stop", (e, p) => (e ? j(e) : r(p)))
  );
  session.disconnect();
  await fs.writeFile(outFile, JSON.stringify(profile));
}

export async function recordHeapSnapshot({ outFile }) {
  const session = new inspector.Session();
  session.connect();
  const chunks = [];
  session.on("HeapProfiler.addHeapSnapshotChunk", (m) => chunks.push(m.params.chunk));
  await new Promise((r, j) => session.post("HeapProfiler.takeHeapSnapshot",
    { reportProgress: false }, (e) => (e ? j(e) : r())));
  session.disconnect();
  await fs.writeFile(outFile, chunks.join(""));
}
```

**F2. CLI commands.** `tools/profiler/inspector/cli.js`, invoked via `pnpm`:

- `pnpm profile:cpu --target=main --duration=5` — sends a request to a small **debug HTTP endpoint** that the bootstrap registered on port 9876 in the chosen process; that endpoint runs `recordCpuProfile()` and writes the file. The CLI prints the path and offers to `open` it (drag-into-DevTools).
- `pnpm profile:heap --target=server` — same shape.

The debug endpoint is **only registered when `OTEL_TRACES_EXPORTER` is set**, i.e. when running under `pnpm run profile`. It binds to 127.0.0.1 only and has no auth (loopback-only is the auth, same posture as Plan 06's hub).

**F3. Targets.** `--target=main|server|main-streaming-worker`. The orchestrator (Phase G) tells the CLI what port each target's debug endpoint is on (we use 9876 for main, 9877 for server, leaving room for renderer-side via DevTools protocol if we ever want it).

**F4. File destination.** All output files go to `dev/profiles/<service>-<ISO timestamp>.<ext>`, gitignored. Naming convention enables shell glob workflows like `open dev/profiles/main-*.cpuprofile`.

**F5. Why not OTel for this?** OTel does have an experimental Profiles signal, but it's not stable and Jaeger doesn't render it. CPU/heap profiles are a fundamentally different visualization (flame graphs of stack samples) than spans (interval trees of named operations). Chrome DevTools renders both file formats natively and is the standard tool. Don't reinvent.

---

### Phase G — Dev UX: `pnpm run profile` orchestrator

This is what the developer actually types.

**G1. NPM scripts.** Added to root `package.json`:

```jsonc
{
  "scripts": {
    "profile":          "node tools/profiler/bin/launch.js",
    "profile:server":   "node tools/profiler/bin/launch.js --only=server",
    "profile:renderer": "node tools/profiler/bin/launch.js --only=renderer",
    "profile:cpu":      "node tools/profiler/inspector/cli.js cpu",
    "profile:heap":     "node tools/profiler/inspector/cli.js heap",
    "profile:gpu":      "node tools/profiler/gpu/cli.js"
  }
}
```

**G2. The orchestrator.** `tools/profiler/bin/launch.js`:

1. Detect Docker: `docker ps` (timeout 1 s). If available → start Jaeger via `docker run -d --rm --name rebound-jaeger -p 16686:16686 -p 4317:4317 -p 4318:4318 jaegertracing/jaeger:<pinned-version>`. If not → download (or use cached) Jaeger binary in `dev/bin/jaeger` and run it.
3. Wait for `http://127.0.0.1:16686/` to respond 200 (poll, 5 s timeout).
4. Set environment for child processes:
   ```
   OTEL_TRACES_EXPORTER=otlp
   OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:4318
   OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf
   VITE_OTEL_ENABLED=1
   VITE_OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:4318
   ```
5. Start `concurrently` with three children (mirrors `electron-dev`):
   - `cross-env BROWSER=none pnpm run start` (Vite renderer; Vite plugin reads `VITE_OTEL_ENABLED` and bundles the renderer bootstrap)
   - `cd server && node --import=../tools/profiler/otel/server.bootstrap.js ./src/app.js` (server with bootstrap pre-imported)
   - `wait-on http://localhost:3000 && electron --import=./tools/profiler/otel/main.bootstrap.js .` (Electron with bootstrap pre-imported)
6. Once at least one HTTP request reaches the OTel endpoint (or after a 3 s grace period), open `http://127.0.0.1:16686/` in the default browser using a tiny cross-platform `open`/`start`/`xdg-open` dispatch.
7. Forward stdout/stderr from children with prefixes (`[main]`, `[server]`, `[renderer]`, `[jaeger]`).
8. On Ctrl-C: stop children, then stop Jaeger (`docker stop rebound-jaeger` or kill the binary), then exit.

**G3. Why not just edit `electron-dev`?** The `electron-dev` script is the developer's everyday command. It must not start Jaeger by default and must not pay the OTel SDK boot cost. `pnpm run profile` is the explicit on-switch — same as how Plan 06's earlier draft used a `PROFILE=1` env var.

**G4. `--only=` modes.** Useful for narrower investigations:

- `--only=server` — start only Jaeger + server (no renderer, no Electron). Handy for hitting the API with `curl` and seeing the trace.
- `--only=renderer` — start only Jaeger + Vite renderer. Useful for browser-only render-perf work (same as opening Vite normally, plus tracing).

**G5. The browser auto-launch.** A tiny dispatch (no `open` package — too many deps):

```js
function openBrowser(url) {
  const cmd = process.platform === "darwin" ? "open"
            : process.platform === "win32"  ? "start"
            : "xdg-open";
  spawn(cmd, [url], { detached: true, stdio: "ignore" }).unref();
}
```

---

### Phase H — GPU profiling for the streaming pipeline (per-vendor, per-platform)

OpenTelemetry tracks CPU-side work — Node spans, HTTP, IPC, FFmpeg lifecycle. The actual encoder runs on the GPU (NVENC, QSV, AMF, VideoToolbox), and so does most of Plan 01's hot path (`gfxcapture` D3D11 surface → `hwmap` → CUDA → NVENC). To answer the questions Plans 01–04 ask — "did the GPU→CPU readback go away?", "is NVENC saturated or starving?", "what's the per-frame encoder latency?" — we need GPU-side observability, and that comes from vendor SDKs and OS-level tools, not OTel.

This phase adds two layers of GPU profiling:

- **Live GPU counters** during a stream, polled at 1 Hz, attached as span events to the active `ffmpeg.process` OTel span (so they appear inline in Jaeger next to the FFmpeg events from Phase E).
- **Deep capture** — a vendor-specific `pnpm profile:gpu --vendor=…` command that wraps the FFmpeg invocation under the right vendor profiler (Nsight Systems, VTune, RGP, Instruments) and produces a vendor-native trace file, opened in the vendor's GUI.

**H1. Vendor + platform detection.** Reuses Plan 05 Phase A's capability probe (`public/streaming/capabilities/gpuDetect/`). The probe already returns `{ os, arch, gpu: { vendor: "nvidia"|"intel"|"amd"|"apple", model, driver } }`. The GPU profiler reads from this; if the probe hasn't run, it runs synchronously on first invocation.

The full support matrix:

| OS / Arch | NVIDIA | Intel | AMD | Apple |
|---|---|---|---|---|
| Windows x86_64 | ✅ NVML + Nsight Systems + GPUView | ✅ PresentMon + VTune + GPA | ✅ PresentMon + RGP + μProf | n/a |
| Windows arm64 | ⚠ NVML if driver present | ⚠ Adreno via PresentMon | n/a | n/a |
| Linux x86_64 | ✅ NVML (`nvidia-smi`) + Nsight Systems | ✅ `intel_gpu_top` + VTune | ✅ `rocm-smi`/`radeontop` + RGP | n/a |
| Linux arm64 | ⚠ `tegrastats` (Jetson) | ⚠ same as x86_64 | ⚠ same as x86_64 | n/a |
| macOS arm64 (Apple Silicon) | n/a (no NV drivers) | n/a | n/a | ✅ Instruments + `powermetrics` + `ioreg` |
| macOS x86_64 (legacy) | n/a | ⚠ `powermetrics` | ⚠ `powermetrics` (eGPU) | n/a |

`✅` = full live-counters + deep-capture. `⚠` = best-effort, live counters only. `n/a` = vendor not present on that OS.

**H2. Live GPU counter polling.** A dedicated module `tools/profiler/gpu/poller.js` runs in the Electron main process whenever an FFmpeg child is alive. It polls at 1 Hz and emits one OTel span event per sample (`gpu.sample`) on the active `ffmpeg.process` span (Phase E1). Each vendor has its own poller backend; the dispatcher picks one based on H1's detection.

Common attributes on every `gpu.sample` event:

```
gpu.vendor          "nvidia" | "intel" | "amd" | "apple"
gpu.model           "NVIDIA GeForce RTX 4090"
gpu.utilization     0..100  (graphics engine % busy)
gpu.encoder.utilization   0..100  (encoder/NVENC/QSV/AMF/Media engine %)
gpu.memory.used.bytes
gpu.memory.total.bytes
gpu.power.watts            (where exposed)
gpu.temperature.c          (where exposed)
gpu.clock.graphics.mhz
gpu.clock.memory.mhz
pcie.rx.bytes_per_sec      (where exposed; Plan 01 cares about this number going to ~0)
pcie.tx.bytes_per_sec
```

This means: **in Jaeger, opening the trace from a 60-second stream shows the FFmpeg span with 60 evenly-spaced gpu.sample events**, each carrying a snapshot of GPU state. The "did Plan 01's GPU→CPU readback elimination work?" check becomes: scrub through the events and confirm `pcie.rx.bytes_per_sec` collapses from ~475 MB/s to near zero.

**H3. NVIDIA — Windows + Linux (x86_64).**

*H3a. Live counters (NVML).* Two implementation choices:

- **Option A: NVML via N-API binding.** Use `nvidia-smi` shell-out (already on every machine with the NVIDIA driver):
  ```
  nvidia-smi --query-gpu=utilization.gpu,utilization.encoder,memory.used,memory.total,power.draw,temperature.gpu,clocks.gr,clocks.mem,pcie.link.gen.gpucurrent,pcie.link.width.current --format=csv,noheader,nounits -lms 1000
  ```
  Streaming CSV every 1000 ms; one process for the duration of the stream; we parse line-by-line into span events. Zero deps. **Picked as default** because the NVML N-API bindings are not maintained for current Node versions and cross-platform binary distribution is painful.
- **Option B: NVML via `node-nvml` if/when a maintained binding exists.** Lower latency than the CLI, more counters available (per-process VRAM, encoder session count, `nvmlDeviceGetEncoderStats`).

For PCIe traffic specifically, NVML exposes `nvmlDeviceGetPcieThroughput()` which returns `PCIE_RX_BYTES`/`PCIE_TX_BYTES` over a sliding window. `nvidia-smi` does not directly expose this; we use `nvidia-smi dmon -s u -c 1` (which prints `pcie_rx_kb_s pcie_tx_kb_s`). The poller runs both `nvidia-smi --query-gpu=…` and `nvidia-smi dmon -s u` and merges their outputs.

*H3b. Per-FFmpeg-process NVENC stats.* FFmpeg with `-loglevel verbose` prints NVENC encoder stats to stderr (encoder name, capabilities, init params); with `-stats` and `-vstats /tmp/vstats.csv` it prints per-frame timing. The FFmpeg wrapper from Phase E1 already parses stderr; we extend it to recognize NVENC-specific lines (`[h264_nvenc @ 0x…]` patterns) and surface them as span attributes on the `ffmpeg.process` span.

*H3c. Deep capture: Nsight Systems.*

`pnpm profile:gpu --vendor=nvidia --duration=30` runs the full streaming pipeline once, wrapped under Nsight Systems' CLI:

```
nsys profile \
  --output dev/profiles/nvidia-<timestamp>.nsys-rep \
  --trace=cuda,nvtx,osrt,opengl,d3d11 \
  --duration=30 \
  --delay=2 \
  --sample=cpu \
  ffmpeg <full pipeline argv from buildFfmpegCommand>
```

What this captures:

- **CUDA API timeline** — every `cuMemAlloc`, `cuLaunchKernel`, `cuMemcpy*`. Confirms whether `hwmap=derive_device=cuda:mode=read` is actually mapping (zero-copy) versus copying (PCIe traffic).
- **D3D11 timeline** — `gfxcapture`'s D3D11 calls, including `IDXGIOutputDuplication::AcquireNextFrame` cadence (this answers "are we hitting the capture FPS or capture-bound?").
- **NVENC timeline** — encoder submit/complete pairs. Per-frame encoder latency. If frames are queueing up, you see it here.
- **OS scheduler / system traces** — context switches, CPU frequency, IRQ activity. Confirms the FFmpeg threads aren't being preempted under load.

Output: one `.nsys-rep` file. Opens in Nsight Systems GUI (`nsys-ui` or the standalone Nsight Systems desktop app). The CLI step requires Nsight Systems installed (free download from NVIDIA, ~1 GB). The orchestrator probes for it (`nsys --version`) and prints install instructions if missing — does not auto-download (license-gated).

*H3d. NVTX annotations.* A small native-free addition: the FFmpeg wrapper in Phase E1 uses NVTX ranges via the Nsight CLI's `--nvtx-domain-include` to inject named ranges into the timeline. We don't link against NVTX in our code; instead, we emit named events in our OTel spans and configure Nsight to import an OTLP→NVTX range bridge (post-process step: a Python script using `nsys` SDK that reads our OTLP export and writes NVTX ranges into the same `.nsys-rep` file). This is optional; the basic capture without it is already useful.

**H4. Intel — Windows + Linux + macOS.**

*H4a. Live counters (Linux: `intel_gpu_top`).*

```
intel_gpu_top -J -s 1000
```

Streams JSON every second containing per-engine utilization (Render/3D, Blitter, **Video** (the QSV engine), VideoEnhance), frequency, power. We parse into the same `gpu.sample` event shape. `intel-gpu-tools` package, available everywhere.

*H4b. Live counters (Windows: PresentMon + WMI).* `intel_gpu_top` does not exist on Windows. We use **Microsoft PresentMon** (cross-vendor):

```
PresentMon-x64.exe -output_stdout -no_csv -metrics gpu_busy,gpu_video_busy,gpu_frame_time,frame_time
```

PresentMon's `gpu_video_busy` is the encoder-engine utilization on Intel; combined with WMI (`Get-CimInstance Win32_VideoController`) for static info, we have what we need. PresentMon is shipped as a small `.exe` we download once into `dev/bin/PresentMon-x64.exe` (gitignored, license-permissive — Microsoft, MIT-licensed).

*H4c. Live counters (macOS x86_64 with Intel iGPU).* `powermetrics --samplers gpu_power -i 1000` (root required). On older Intel Macs.

*H4d. Per-FFmpeg-process QSV stats.* Same as NVIDIA — FFmpeg's `[h264_qsv @ 0x…]` log lines parsed by the Phase E1 wrapper.

*H4e. Deep capture (Linux + Windows): Intel VTune Profiler.*

```
vtune -collect gpu-hotspots \
  -result-dir dev/profiles/intel-<timestamp>.vtune \
  -- ffmpeg <argv>
```

VTune's `gpu-hotspots` analysis captures EU (execution unit) occupancy, memory traffic, sampler busy, and kernel timeline. Output opens in VTune GUI. VTune is free for all use as of 2024+.

*H4f. Deep capture (Windows alternate): Intel GPA.* For per-frame analysis (most relevant when we want to see if the encoder is starving). Same install-then-run posture as Nsight; orchestrator probes for it.

*H4g. Deep capture cross-vendor (Windows): PresentMon CSV + GPUView.* PresentMon's CSV mode produces per-frame timestamps for the entire pipeline (Sim → CPU → GPU → Present → Display). For our use case (encoder pipeline), the relevant columns are `MsBetweenAppStart`, `MsBetweenPresents`, `MsInPresentAPI`, `MsGPUActive`. We generate this CSV alongside the OTel traces.

**H5. AMD — Windows + Linux.**

*H5a. Live counters (Linux: `rocm-smi` for ROCm-capable, `radeontop` for everyone).* ROCm's coverage of consumer Radeon is incomplete; we fall back gracefully:

- Try `rocm-smi --json --showuse --showtemp --showpower --showmemuse --showclocks -P`. If it errors → `radeontop -d -` (pipe text output, parse).
- For PCIe: `rocm-smi --showpcie` is unreliable on consumer parts. We accept "unknown" here.

*H5b. Live counters (Windows): PresentMon.* Same approach as Intel/Windows in H4b. `gpu_video_busy` is AMD's VCN/UVD encoder engine utilization.

*H5c. Per-FFmpeg-process AMF stats.* FFmpeg's AMF encoders (`h264_amf`, `hevc_amf`) print stats to stderr on `-loglevel verbose`. Same parser path as NVENC/QSV.

*H5d. Deep capture: Radeon GPU Profiler (RGP).*

RGP requires the **AMD Developer Mode** driver setting toggled on (registry key on Windows; kernel module on Linux). The orchestrator can't toggle that automatically — it requires admin privilege and a one-time setup. Our `pnpm profile:gpu --vendor=amd` instead:

1. Probes for RGP install (`%RADEON_DEVELOPER_PATH%` on Windows, `~/RGP/` on Linux).
2. Probes for Developer Mode driver flag.
3. If both present: launches `RadeonDeveloperPanel.exe` (or `RadeonDeveloperPanel` on Linux) with auto-capture configured for the FFmpeg PID, runs the stream, captures.
4. If either missing: prints clear setup instructions and falls back to live counters only.

Output: `.rgp` file. Opens in Radeon GPU Profiler GUI. Limited use without Developer Mode — most users never get to deep-capture territory on AMD; the live counters from H5a/b are the practical ceiling.

**H6. Apple — macOS arm64 (Apple Silicon).**

*H6a. Live counters: `powermetrics` + `ioreg`.* `powermetrics --samplers gpu_power -i 1000` requires root, but for dev that's acceptable (the orchestrator prompts once with `sudo`).  Output:

```
GPU HW active frequency: 1296 MHz
GPU HW active residency: 67.21%
GPU SW requested state: P1=0% P2=0% P3=8% P4=92%
GPU idle residency: 32.79%
GPU Power: 8421 mW
```

We parse the HW-active residency as `gpu.utilization`, the GPU Power as `gpu.power.watts`. There is no separate "encoder engine utilization" counter on Apple Silicon — the Media Engine is opaque from `powermetrics`. We get its activity indirectly via `ioreg`:

```
ioreg -r -d 1 -w 0 -c IOAccelerator   # global GPU command queue depth
ioreg -r -d 1 -w 0 -c AppleAVD         # VideoToolbox decoder/encoder driver
```

`AppleAVD` exposes per-channel queue depth; we sample it for `videotoolbox.encoder.queue_depth`.

*H6b. Per-FFmpeg-process VideoToolbox stats.* FFmpeg's `[h264_videotoolbox @ 0x…]` log lines parsed by Phase E1.

*H6c. Deep capture: Instruments / Metal System Trace via `xctrace`.*

`xctrace` is the CLI for Xcode's Instruments. The "Metal System Trace" template captures GPU command buffer activity, including the AVE (Apple Video Engine) when VideoToolbox encodes via Metal:

```
xctrace record \
  --template "Metal System Trace" \
  --output dev/profiles/apple-<timestamp>.trace \
  --launch -- /opt/homebrew/bin/ffmpeg <argv>
```

Output: `.trace` bundle directory. Opens in Instruments.app (`open dev/profiles/apple-….trace`). Shows GPU command buffer encode/submit/complete timeline alongside CPU activity.

`xctrace` is bundled with Xcode (or the Command Line Tools, which is a smaller install). The orchestrator probes for `xctrace --version` and prints `xcode-select --install` instructions if missing.

*H6d. `os_signpost` integration (optional, future).* macOS's signposts show up natively in Instruments. We don't link against `os_signpost` in JS, so this is out of scope for this plan; flagged for a future plan that adds a small native helper.

**H7. PresentMon as cross-vendor truth on Windows.** Worth its own callout: PresentMon is the only tool that gives **frame-pacing across all three vendors on Windows** with a uniform CSV schema. For "is the streamed video smooth or hitching?" questions, we always run PresentMon alongside the vendor-specific tool. The orchestrator on Windows always starts PresentMon when `pnpm profile:gpu` runs; the CSV sits next to the vendor profile.

**H8. FFmpeg verbose stats parsing.**

In every vendor case, we set FFmpeg's logging to `-loglevel verbose -stats -vstats_file dev/profiles/ffmpeg-vstats-<timestamp>.csv`. The `vstats` CSV gives per-frame:

```
frame=N fps=F.F q=Q size=B time=T bitrate=B speed=S
```

The Phase E1 FFmpeg wrapper parses this into a 1 Hz aggregated event on the `ffmpeg.process` span and also writes the raw CSV to `dev/profiles/`. Useful for plotting outside the trace if needed.

**H9. The `pnpm profile:gpu` orchestrator.** Added in `tools/profiler/gpu/cli.js`:

```
pnpm profile:gpu                               # full streaming run, auto-detect vendor, all defaults
pnpm profile:gpu --vendor=nvidia               # force vendor (even if multiple GPUs present)
pnpm profile:gpu --vendor=nvidia --no-deep     # live counters only, no Nsight wrap
pnpm profile:gpu --duration=30                 # cap duration
pnpm profile:gpu --target-fps=60 --resolution=1920x1080  # synthetic test source instead of capture
```

Behavior:

1. Calls Plan 05 Phase A's capability probe; resolves the vendor (or honors `--vendor`).
2. Picks the appropriate poller backend (H3a/H4a/H5a/H6a) based on vendor + OS.
3. Spawns FFmpeg with the active StreamConfig (or a synthetic source if `--target-fps`/`--resolution` set, useful for repeatable benchmarks). FFmpeg's argv passed through Phase E1's wrapper, so all OTel + GPU events go into the same Jaeger trace.
4. If `--no-deep` is not set: also spawns the vendor's deep-capture tool wrapping the FFmpeg PID (or relaunches FFmpeg under the deep-capture tool's process group, depending on the tool).
5. On exit: prints the file paths of all artifacts (`.nsys-rep` / `.vtune` / `.rgp` / `.trace`, plus the `vstats` CSV, plus the Jaeger trace ID), and offers to `open` them.

**H10. CI (best-effort).** Headless GPU profiling in CI is fragile (no display, no consumer drivers in cloud runners). We do not gate any tests on GPU profile output. We do add one smoke test per vendor that runs only when the corresponding vendor's CLI is detected on the runner — runs a 5-second synthetic stream and asserts that at least 3 `gpu.sample` events appeared on the `ffmpeg.process` span. Skipped silently on runners without the vendor.

---

## Code organization & implementation notes

### Top-level layout

```
tools/profiler/                                  (new top-level directory)
  package.json                                   -- internal workspace pkg
  README.md                                      -- "what is this & how do I use it"

  otel/
    bootstrapNode.js                             -- shared OTel SDK setup for Node procs
    main.bootstrap.js                            -- service.name = rebound-main
    server.bootstrap.js                          -- service.name = rebound-server
    renderer.bootstrap.js                        -- WebTracerProvider + browser instrs
    vite-plugin.js                               -- conditional inject of renderer bootstrap
    util.js                                      -- withSpan / withSpanAsync helpers
    instrumentation/
      ipc.js                                     -- instrumentIpcMain / instrumentIpcRenderer
      ffmpeg.js                                  -- wrapSpawn(spawn)
      reactProfiler.jsx                          -- <ProfileScope>
      runtimeMetrics.js                          -- 1 Hz RSS / heap / loop lag

  inspector/
    cpu.js                                       -- recordCpuProfile()
    heap.js                                      -- recordHeapSnapshot()
    cli.js                                       -- pnpm profile:cpu / profile:heap entry
    debugServer.js                               -- 127.0.0.1:9876/9877 endpoints in main/server

  gpu/
    poller.js                                    -- live GPU counter dispatcher (auto-picks vendor)
    cli.js                                       -- pnpm profile:gpu entry
    backends/
      nvml.js                                    -- nvidia-smi shell-out + CSV parser
      intelGpuTop.js                             -- intel_gpu_top -J streaming parser
      rocmSmi.js                                 -- rocm-smi --json polling
      radeontop.js                               -- radeontop fallback for non-ROCm AMD
      presentmon.js                              -- Windows cross-vendor PresentMon CSV parser
      powermetrics.js                            -- macOS powermetrics --samplers gpu_power
      ioreg.js                                   -- macOS ioreg AppleAVD queue-depth sampler
    deepCapture/
      nsight.js                                  -- nsys profile wrapper (NVIDIA)
      vtune.js                                   -- vtune -collect gpu-hotspots wrapper (Intel)
      rgp.js                                     -- Radeon GPU Profiler launcher + dev-mode probe
      xctrace.js                                 -- xctrace record --template "Metal System Trace"
    ffmpegStats.js                               -- vstats CSV + verbose-log parser (NVENC/QSV/AMF/VT)
    detect.js                                    -- thin wrapper over Plan 05's capability probe

  bin/
    launch.js                                    -- the `pnpm run profile` orchestrator
    jaeger.js                                    -- start/stop helpers (docker + binary fallback)

  __tests__/
    bootstrapNode.test.js                        -- start/stop, off-by-default
    instrumentationIpc.test.js                   -- propagate context through fake ipc
    instrumentationFfmpeg.test.js                -- replay stderr fixtures, assert events
    util.test.js                                 -- withSpan happy path + exception path
    nvmlParser.test.js                           -- nvidia-smi CSV → events
    intelGpuTopParser.test.js                    -- intel_gpu_top -J → events
    rocmSmiParser.test.js                        -- rocm-smi JSON → events
    presentMonParser.test.js                     -- PresentMon CSV → events
    powermetricsParser.test.js                   -- powermetrics text → events
    ffmpegStats.test.js                          -- vstats CSV + nvenc/qsv/amf/vt log parsing
    fixtures/
      ffmpeg-stderr.txt                          -- canned FFmpeg output (generic)
      ffmpeg-stderr-nvenc.txt                    -- canned NVENC verbose log
      ffmpeg-stderr-qsv.txt                      -- canned QSV verbose log
      ffmpeg-stderr-amf.txt                      -- canned AMF verbose log
      ffmpeg-stderr-videotoolbox.txt             -- canned VideoToolbox verbose log
      ffmpeg-vstats.csv                          -- canned vstats CSV
      nvidia-smi-query.csv                       -- canned nvidia-smi --query-gpu output
      nvidia-smi-dmon.txt                        -- canned dmon -s u output
      intel-gpu-top.json                         -- canned intel_gpu_top -J output
      rocm-smi.json                              -- canned rocm-smi --json output
      presentmon.csv                             -- canned PresentMon CSV
      powermetrics.txt                           -- canned powermetrics samplers gpu_power output
```

### Cross-process boundaries

There are four boundaries; everything else is internal:

1. **Tracing client ↔ Jaeger collector (OTLP/HTTP, port 4318).** Standard OpenTelemetry wire format; we don't own this protocol, OTel does.
2. **CLI ↔ in-process debug server (127.0.0.1:9876/9877, JSON over HTTP).** Tiny custom protocol for CPU profile / heap snapshot capture. Lives in `tools/profiler/inspector/`. One JSON shape per command. Loopback-only.
3. **Renderer ↔ Main IPC, with `__otel` envelope (Phase D2).** Wrappers on both sides hide the envelope from application code. Wire format change is one PR, both sides updated.
4. **GPU poller ↔ vendor CLI (stdio of `nvidia-smi` / `intel_gpu_top` / `rocm-smi` / `PresentMon` / `powermetrics`).** Each backend in `tools/profiler/gpu/backends/` parses one specific vendor CLI's output format. Each parser is a pure function `(text) => GpuSample` and is independently testable against canned fixtures.

### Architectural rules

- **OTel SDK is loaded once per process via `--import` flag.** Application code never imports the SDK directly. It imports `@opentelemetry/api` (the API package, which is decoupled from any SDK and is a no-op when no SDK is registered).
- **Auto-instrumentation > custom instrumentation.** If OTel ships an instrumentation for a thing, we use it. We only write custom code for IPC, FFmpeg, and React.
- **Custom wrappers degrade to identity when OTel is off.** `wrapSpawn(spawn)` returns `spawn` itself when `OTEL_TRACES_EXPORTER` is unset. `instrumentIpcMain(ipcMain)` is a no-op. The result: zero behavioral change when off.
- **Service names are fixed.** `rebound-main`, `rebound-server`, `rebound-renderer`. Used everywhere. Defined in `tools/profiler/otel/serviceNames.js` so renames are one-line.
- **Inspector commands and OTel are independent.** `pnpm profile:cpu` works whether or not OTel is enabled (it talks to its own debug server, not OTel). They just happen to both come up under `pnpm run profile` because both are dev-only.

### Type discipline

Per the project convention, define typedefs in `tools/profiler/otel/types.js`:

```js
/** @typedef {Object} BootstrapOptions
 *  @property {string} serviceName
 *  @property {string=} instanceId
 */
/** @typedef {Object} IpcOtelEnvelope
 *  @property {Object} __otel
 *  @property {Array<unknown>} payload
 */
```

### Naming and module conventions

- Files in `kebab-case.js`, exports in `camelCase`. JSX components in `PascalCase`.
- Test files in `__tests__/` with mirrored structure.
- `tools/profiler/otel/` deliberately segregated from `tools/profiler/inspector/` because the two are independent observability layers (tracing vs profiling).
- No barrel re-exports.
- Imports ordered: stdlib → `@opentelemetry/*` → other third-party → `tools/profiler/` → relative.

### Testing strategy

- **Bootstrap modules** — call `startOtel({ serviceName: "test" })` with `OTEL_TRACES_EXPORTER=otlp` pointing at an in-memory exporter (`InMemorySpanExporter` from `@opentelemetry/sdk-trace-base`). Generate a span. Assert it's exported with the expected service name and attributes.
- **IPC wrapper** — fake `ipcMain` and fake `ipcRenderer`. Wrap both. Invoke a channel with an active span on the renderer side. Assert the main-side handler runs with the same trace ID.
- **FFmpeg wrapper** — fake `child_process.spawn`. Pipe `fixtures/ffmpeg-stderr.txt` through stderr. Assert correct sequence of `addEvent` calls with parsed `fps`/`speed`/etc.
- **CPU profile** — call `recordCpuProfile({ durationMs: 200, outFile: tmp })`. Assert file exists, parses as JSON, has `nodes` array. Smoke test only — we don't need to validate V8's profile correctness.
- **Off-by-default** — boot without `OTEL_TRACES_EXPORTER` set. Generate 1000 spans through the API. Assert no network traffic, no exporter activity. Use Node's network mocking or a manual sink.

### Why this plan and not a pure custom one

- **Auto-instrumentation coverage.** The `auto-instrumentations-node` pack covers Express, HTTP, Mongoose, Socket.IO, fetch, and DNS out of the box. Hand-rolling those is what made Plan 06's old draft 1500 lines. With OTel, that's `getNodeAutoInstrumentations()`.
- **Trace context propagation.** W3C `traceparent` propagation across HTTP is a solved problem that OTel handles. Hand-rolling this for renderer ↔ server (which involves both browser and Node parsing the same header format) is enough work to be worth offloading.
- **The viewer is free.** Jaeger UI is the de facto distributed tracing UI. Searches, waterfalls, comparisons, dependency graphs. A custom dashboard is a maintenance liability; Jaeger is maintained by people whose full-time job is making distributed tracing UIs.
- **Transferable skills.** OTel + Jaeger is the same stack used at Microsoft, Uber, Cloudflare, Shopify, etc. Anyone who joins the team and has worked with distributed systems before knows it. A custom format is a tax on every new contributor.
- **Future-proofing.** OTLP is a vendor-neutral protocol. The same instrumented codebase can later send to Tempo, Honeycomb, Datadog, New Relic, Lightstep, or back to a custom collector — by changing one URL, no code changes. A custom format locks us in.

The trade-offs we accept:

- **Off-cost is ~tens of nanoseconds, not ~one nanosecond.** OTel's `tracer.startActiveSpan` (with no SDK installed, just the API) does an allocation + a context lookup. Empirically ~50–200 ns per call when no SDK is registered. Acceptable for our hot paths (FFmpeg-stage timings, request handlers); the only thing this rules out is per-frame instrumentation in tight render loops, which we don't have in JS anyway (FFmpeg owns that).
- **One Docker container for the dev loop (or one binary fallback).** Plan-06-old needed zero infrastructure. This plan needs Jaeger running. Mitigated by: (a) the orchestrator handles it, (b) the binary fallback works without Docker, (c) Jaeger's footprint at idle is ~30 MB RAM.

---

## Migration & rollout

- **Phase A (Jaeger backend) ships first.** Pure infrastructure: a script and a pinned Jaeger image. No code changes anywhere else.
- **Phase B (Node bootstraps) ships next.** Adds OTel deps, two bootstrap files, no wire-up yet. Importable but not loaded by any production path. Verifiable by running `pnpm run profile:server` and seeing server traces in Jaeger.
- **Phase C (renderer bootstrap and Vite plugin) ships next.** Same shape: importable but not loaded by default. Verifiable by running `pnpm run profile:renderer` and clicking around — `documentLoad` and `userInteraction` traces appear.
- **Phase D (HTTP and IPC propagation) ships next.** HTTP propagation is free with B+C. IPC propagation is the one custom piece. After this phase, end-to-end traces (renderer click → server response) work.
- **Phase E (FFmpeg + React + runtime metrics) ships piecewise.** Independent of the others; each can land in its own PR.
- **Phase F (CPU/heap profiles) ships independently.** No dependency on OTel.
- **Phase G (`pnpm run profile` orchestrator) ships last.** Ties it all together for the developer.
- **Phase H (GPU profiling) ships piecewise per vendor and per platform**, in this order:
  1. Live counters: NVIDIA Linux/Windows (nvidia-smi) — most users have this; one PR.
  2. Live counters: Intel Linux (`intel_gpu_top`) and Apple (`powermetrics`) — independent PRs.
  3. Live counters: AMD Linux (`rocm-smi` + `radeontop` fallback).
  4. Live counters: Windows cross-vendor via PresentMon (covers Intel/AMD/NVIDIA on Windows).
  5. FFmpeg vendor-specific stats parsing (NVENC/QSV/AMF/VideoToolbox) — one shared PR; pure parser, no platform conditionals.
  6. Deep capture wrappers — one PR per vendor (Nsight, VTune, RGP, xctrace).
  7. `pnpm profile:gpu` orchestrator — last, after all backends exist.

  Phase H lands progressively. Each step ships value: even just (1) lets us validate Plan 01's GPU→CPU readback elimination on the most common hardware (Windows + RTX). The deep-capture wrappers are gravy — most investigations are answered by live counters.

The plan is **off by default at every step**. Through every phase, `pnpm run electron-dev` and `pnpm run dist` are unaffected — no OTel SDK is loaded, no Jaeger is started, and no code path behaves differently from today.

---

## Validation

- **Phase A:** `pnpm run profile` (or `tools/profiler/bin/jaeger.js start`) brings Jaeger up; `curl http://127.0.0.1:16686/` returns 200 within 5 s on a warm cache.
- **Phase B:** Run server with `OTEL_TRACES_EXPORTER=otlp`. Hit `GET /api/csrf` 100 times. Jaeger's search for service `rebound-server` shows 100 traces, each with one Express span (and one Mongoose span for any queries). Each span has `http.method`, `http.route`, `http.status_code`, `http.response_content_length`.
- **Phase B (off-cost):** Boot the server and Electron main without `OTEL_TRACES_EXPORTER`. The OTel SDK does not initialize — verifiable by absence of `instrumentation` log lines and absence of TCP traffic to 4318. Steady-state RSS is within 1% of pre-plan baseline.
- **Phase C:** Open the renderer with `VITE_OTEL_ENABLED=1`. Jaeger shows a `documentLoad` trace per page load and a `user.click` span per click.
- **Phase D — HTTP propagation:** Click an action that triggers a fetch. The Jaeger trace shows one root in `rebound-renderer` with a child span in `rebound-server` (same trace ID).
- **Phase D — IPC propagation:** Click "Start streaming". Trace shows the chain renderer → main → server (described in Phase D3).
- **Phase E — FFmpeg:** Stream for 30 seconds. Jaeger shows one `ffmpeg.process` span with N `status` events (one per second from the FFmpeg status line) and one `segment.write` event per segment. Span attributes include the resolved FFmpeg argv.
- **Phase E — runtime metrics:** A `runtime.heartbeat` span appears for each process at 1 Hz, with `rss.bytes`, `heap.used.bytes`, `event_loop.lag.ms` events.
- **Phase F — CPU profile:** `pnpm profile:cpu --target=main --duration=5` while the user is doing something visible. The resulting `.cpuprofile` opens in Chrome DevTools' Performance tab and shows a flame graph with stack frames from the relevant module.
- **Phase F — heap snapshot:** `pnpm profile:heap --target=server` produces a `.heapsnapshot` openable in Chrome DevTools' Memory tab. Object counts roughly match what we expect (e.g. one `Express` constructor instance, N `StreamSession` documents).
- **Phase G — orchestrator:** `pnpm run profile` on macOS, Windows, and Linux opens Jaeger at `http://127.0.0.1:16686` automatically; `Ctrl-C` cleans up all child processes (no orphan Electron, no orphan FFmpeg, no orphan Vite, no orphan Jaeger container).
- **End-to-end:** Run `pnpm run profile`. Click "Start streaming". After 30 seconds, click "Stop streaming". Open Jaeger, find the trace rooted at the start click. Verify it contains spans from `rebound-renderer`, `rebound-main`, and `rebound-server`, with consistent timestamps and parent-child relationships.
- **Phase H — live counters (NVIDIA Linux/Windows):** Stream for 30 seconds on a machine with an NVIDIA GPU. Open the Jaeger trace; the `ffmpeg.process` span shows ≥ 25 `gpu.sample` events with non-zero `gpu.encoder.utilization`. After Plan 01 lands, verify `pcie.rx.bytes_per_sec` is ≤ 50 MB/s during steady state (vs ~475 MB/s pre-Plan-01).
- **Phase H — live counters (Intel Linux):** Same as above on Intel hardware; `gpu.sample` events show non-zero `Video` engine utilization (the QSV engine).
- **Phase H — live counters (AMD Linux):** Same as above on AMD hardware via `rocm-smi`; falls back to `radeontop` text parser when ROCm is not installed (verified via a fixture-driven unit test).
- **Phase H — live counters (Windows cross-vendor):** Run on Windows + any GPU; PresentMon CSV produces ≥ 25 samples and the parser converts them to `gpu.sample` events with non-zero `gpu_video_busy`.
- **Phase H — live counters (Apple Silicon):** `powermetrics` requires sudo; the orchestrator prompts once. Stream for 30 seconds; events show non-zero `gpu.utilization` and a non-zero `videotoolbox.encoder.queue_depth` derived from `ioreg -c AppleAVD`.
- **Phase H — FFmpeg stats parsing:** Replay each canned vendor log fixture through the parser and assert correct attribute extraction for `[h264_nvenc]`, `[h264_qsv]`, `[h264_amf]`, `[h264_videotoolbox]`. Pure unit tests, no GPU required.
- **Phase H — deep capture (NVIDIA):** On a machine with Nsight Systems installed, `pnpm profile:gpu --vendor=nvidia --duration=10` produces a `.nsys-rep` file that opens in `nsys-ui`. The capture timeline includes a CUDA section with `cuMemcpy*` calls visible (or absent — Plan 01's success criterion).
- **Phase H — deep capture (Apple):** `pnpm profile:gpu --duration=10` on Apple Silicon produces a `.trace` bundle that opens in Instruments.app and shows the Metal command queue activity for the FFmpeg process.
- **Phase H — graceful degradation:** Run `pnpm profile:gpu` on a machine where the vendor's deep-capture tool is not installed. The orchestrator falls back to live counters only and prints a one-paragraph install hint for the missing tool. No crash, no hang.
