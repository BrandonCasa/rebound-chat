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
    "profile:heap":     "node tools/profiler/inspector/cli.js heap"
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

  bin/
    launch.js                                    -- the `pnpm run profile` orchestrator
    jaeger.js                                    -- start/stop helpers (docker + binary fallback)

  __tests__/
    bootstrapNode.test.js                        -- start/stop, off-by-default
    instrumentationIpc.test.js                   -- propagate context through fake ipc
    instrumentationFfmpeg.test.js                -- replay stderr fixtures, assert events
    util.test.js                                 -- withSpan happy path + exception path
    fixtures/
      ffmpeg-stderr.txt                          -- canned FFmpeg output
```

### Cross-process boundaries

There are three boundaries; everything else is internal:

1. **Tracing client ↔ Jaeger collector (OTLP/HTTP, port 4318).** Standard OpenTelemetry wire format; we don't own this protocol, OTel does.
2. **CLI ↔ in-process debug server (127.0.0.1:9876/9877, JSON over HTTP).** Tiny custom protocol for CPU profile / heap snapshot capture. Lives in `tools/profiler/inspector/`. One JSON shape per command. Loopback-only.
3. **Renderer ↔ Main IPC, with `__otel` envelope (Phase D2).** Wrappers on both sides hide the envelope from application code. Wire format change is one PR, both sides updated.

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
