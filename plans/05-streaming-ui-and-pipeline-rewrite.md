# Plan 05: Streaming UI rewrite, capability-aware settings, audio redesign, and server-driven adaptation

## Problem

The current streaming experience has a single tall page (`src/routes/DesktopLivePage/DesktopLivePage.route.jsx`) that exposes raw FFmpeg-adjacent controls (codec, preset, B-frames, lookahead, multipass, NVENC tune, AQ knobs, etc.) without:

1. **Knowledge of what the user's system can actually do.** The UI lets a user pick `hevc_nvenc` on a laptop without an NVIDIA GPU, or `videotoolbox` on Windows, or pick combinations like `tune=ull + multipass=fullres + lookahead=16` that quietly contradict each other. Validation is a flat list of `throw new Error(...)` calls in `normalizeConfig`; the UI itself has no concept of constraints.

2. **No persistence.** Settings are held in component state. Restart Electron and they're gone.

3. **No "just make it work" path.** A new user is presented with ~30 settings, all defaulted to whatever was hardcoded years ago.

4. **No video file streaming.** The pipeline assumes desktop/window capture; users cannot point it at a local `.mp4` to broadcast.

5. **Audio is an afterthought.** A single text field for `audioInputArgs` accepts arbitrary FFmpeg input arguments. Users cannot:
   - Mix microphone + desktop audio without writing FFmpeg flags by hand
   - Capture audio from one app (the game) only
   - Capture everything *except* one app (mute Discord but keep the game and Spotify)
   - Adjust per-source levels

6. **Server has no say in the stream's parameters.** Today the streamer sets it once at start. There is no channel from the server (or from viewers via the server) back to the streamer to say "your viewers can only handle h264 at 4 Mbit." The streamer has to guess.

## Why this should be fixed

- New users get scared by the current settings page and either pick blindly or churn.
- "Settings combos that crash FFmpeg" is a constant support pattern (e.g. `temporal_aq=1 + lookahead=0`, `hevc_nvenc` on AMD GPUs, `gfxcapture` on macOS).
- Without persistence, every restart costs the user a re-configuration session.
- File-source streaming is a high-value, low-effort feature that broadens the product (broadcast a finished VOD, run a movie night).
- Per-app audio control is a genuine differentiator — it's the #1 feature OBS users ask their setup tools for.
- Server-driven adaptation is the only architecturally correct way to handle a viewer base with mixed devices. Without it, the streamer either over-shoots (wasting bandwidth/CPU) or under-shoots (wasting quality).

## Expected result

- A settings UI organized into a **simple "Auto-optimized" path** (default) and an **advanced manual path** (collapsed by default).
- The UI **cannot let the user pick an invalid combo.** Disabled-by-constraint options are visibly disabled with a tooltip explaining why.
- Settings persist across app restarts. A "Reset to defaults" button is one click away.
- A **Source picker** with three modes: **Screen / Window / Video file**.
- An **Audio mixer** UI showing every detected audio source (mic, desktop loopback, per-app loopback, file audio when applicable) with per-source mute, level, and an "exclude this app" toggle.
- A **Live status panel** during streaming showing: viewer count, aggregated viewer capabilities, current streaming parameters, what changed since stream start, and why (server-recommended vs manual).
- The streamer's actual stream parameters can be **lowered automatically** in response to viewer constraints. They never exceed what the user originally selected.

## How to fix

This is a multi-phase project. Phases are ordered so each one ships value on its own and unblocks the next.

---

### Phase A — System capability probe (foundation for everything else)

Before redesigning the UI, the app needs to know what the user's machine can do.

**A1. Add a `capabilities.js` module in the Electron main process.** On app start (and on demand from a "Re-probe" button), it runs:

- `os.platform()`, `os.arch()`, `os.cpus()`, `os.totalmem()`
- `ffmpeg -hide_banner -hwaccels` → parse out `cuda`, `d3d11va`, `qsv`, `videotoolbox`, etc.
- `ffmpeg -hide_banner -encoders` → parse the list, intersect with our supported codec list
- `ffmpeg -hide_banner -filters` → check for `gfxcapture`, `scale_cuda`, `hwmap`, `amix`, `amerge`
- On Windows: query the GPU via `wmic path Win32_VideoController get Name,DriverVersion` (or the modern equivalent — PowerShell `Get-CimInstance Win32_VideoController`)
- On Windows: enumerate display modes (resolution, refresh rate) per monitor
- Display device enumeration via Electron's `screen.getAllDisplays()`
- Audio device enumeration (Phase E uses this)

The probe writes its result to `app.getPath('userData')/capabilities.json` so the renderer can read it synchronously on UI mount.

**A2. Define a typed capability shape.** The renderer consumes one well-defined object: `{ os, gpu, encoders: { nvenc: { h264: true, hevc: true, av1: false }, ... }, captureBackends: ['gfxcapture', 'gdigrab'], audioDevices: [...], displays: [...] }`. The UI only ever reads from this shape.

**A3. Expose probe via IPC.** Add `ipcMain.handle('capabilities:get', ...)` and `capabilities:reprobe`. The renderer wraps these in a hook (`useCapabilities`).

---

### Phase B — Settings persistence and "Clear saved settings"

**B1. Pick a storage location.** `app.getPath('userData')/stream-settings.json` is the right place. Atomic writes (write to `.tmp` then rename) so a crash mid-write doesn't corrupt.

**B2. Versioned schema.** First field of every settings file is `schemaVersion: 1`. Future migrations live in `migrateSettings(raw)` and bump the version.

**B3. Two IPC handlers.** `settings:load` and `settings:save`. Save throttled to once per second to avoid disk thrash on rapid form changes.

**B4. Renderer hook.** `useStreamSettings()` returns `[settings, updateSettings, resetSettings]`. `resetSettings()` writes the defaults and re-runs the auto-optimize routine (Phase C3). A confirmation dialog is shown before reset.

**B5. Two-tier defaults.** "Defaults" means the auto-optimized values for *this machine*, not a hardcoded constant. So `Reset` doesn't drop a Windows + RTX user back into a generic config — it re-runs the optimizer.

**B6. Backwards compatibility.** Existing users (no settings file) get auto-optimized on first launch. Their current implicit defaults are forgotten by design.

---

### Phase C — Settings UI rewrite with constraint engine and auto-optimize

This phase replaces `DesktopLivePage.route.jsx` and the settings sections of `SettingsPage.route.jsx`.

**C1. Page layout.**

```
┌─ Source ───────────────────────────────────────┐
│ ( ) Screen   ( ) Window   ( ) Video file       │
│ [thumbnail picker / file input]                 │
├─ Audio mixer ──────────────────────────────────┤
│ [Phase E content]                               │
├─ Output ───────────────────────────────────────┤
│ [Auto-optimize]  [Custom ▾]                     │
│  → Resolution, FPS, bitrate, codec, latency     │
├─ Advanced (collapsed) ─────────────────────────┤
│  → preset, lookahead, B-frames, AQ, VBV, ...    │
├─ Live status (only visible while streaming) ───┤
│ [Phase F content]                               │
└─────────────────────────────────────────────────┘
```

**C2. Constraint engine.** Centralize all validity rules in `src/lib/streaming/constraints.js`. Each constraint is a function `(settings, capabilities) => { field, valid, reason }`. Examples:

- `videoCodec` must be in `capabilities.encoders.<family>.<codec>`. NVENC codecs are filtered out if no NVIDIA GPU was detected.
- `nvencTune === 'ull'` ⇒ `nvencLookahead` should be 0 and `multipass` should be 'disabled'. If user manually sets otherwise, the field shows a yellow warning and "fix automatically" link.
- `nvencTemporalAq` requires `nvencLookahead > 0`.
- `gopSize` is recommended to equal `fps × hlsTime`. Surface as a soft warning, not a hard block.
- `convertStreamToSdr` requires `zscale` and `tonemap` filters present in capabilities.
- `captureBackend === 'gfxcapture'` requires Windows + the filter present.
- `outputWidth × outputHeight` ≤ encoder's max (NVENC's max is 8192×8192 for newer cards, less for older).
- `videoBitrate` minimum is codec-specific (libvpx-vp9 needs ≥ 100k for stability, etc.).

The engine returns a `Map<fieldName, ConstraintResult[]>`. The form layer reads it to:
- Disable options that are hard-invalid
- Show a yellow caution under fields that are soft-invalid
- Refuse to enable the "Start streaming" button if any hard-invalid field exists
- Provide "Fix automatically" affordances for soft issues

**C3. Auto-optimize button.**

`autoOptimize(capabilities)` is a pure function that produces a `Settings` object given the system capabilities:

```
if has NVIDIA RTX 20+:
  videoCodec = "h264_nvenc"  // best browser/device compatibility today
  encoderPreset = "p4"
  nvencTune = "ull"
  nvencMultipass = "disabled"
  nvencLookahead = 0
  nvencBFrames = 0
  nvencBRefMode = "disabled"
  nvencSpatialAq = true
  nvencTemporalAq = false
  vbvMultiplier = 1.0    // see Plan 04
elif has Intel Arc / iGPU with QSV:
  videoCodec = "h264_qsv"
  encoderPreset = "veryfast"
elif macOS Apple Silicon:
  videoCodec = "h264_videotoolbox"
elif fallback:
  videoCodec = "libx264"
  encoderPreset = "veryfast"

resolution = min(primary display res, 1920x1080)  // 1080p ceiling for sane bandwidth
fps        = min(primary display refresh, 60)
bitrate    = pick by resolution: 1080p60=8M, 1080p30=6M, 720p60=5M, 720p30=3M
captureBackend = "gfxcapture" if Win+RTX else "gdigrab" if Win else native
audioInputs = [primary mic, default desktop loopback]
hlsTime    = 2; gopSize = fps * hlsTime
```

Auto-optimize is the **default** for new installs (Phase B6). The button is also always available to reset to optimized values.

**C4. "Custom" mode unlocks advanced controls.** Picking Custom shows the Advanced section. Auto-optimize → Custom is one click; Custom → Auto-optimize confirms ("This will discard your manual changes").

**C5. Field-by-field tooltips.** Every advanced field has a one-sentence explanation and a link to longer docs. Latency-sensitive fields are marked with a clock icon.

---

### Phase D — Video file streaming as a source mode

**D1. Source picker.** Add the third radio (`Video file`) to the source picker. Selecting it shows a file picker (`dialog.showOpenDialog`) with filters for `.mp4`, `.mkv`, `.mov`, `.webm`, `.ts`.

**D2. Probe the file with ffprobe.** Validate it has a video stream, capture native width/height/fps/codec/audio. If unsupported, refuse with a clear error before stream start.

**D3. New input branch in `buildFfmpegCommand`.** When the source is a file:

```
[ffmpeg] -re -stream_loop -1 -i <file>  // -re paces input to wall-clock; -stream_loop -1 if loop-on-end is enabled
       -map 0:v -map 0:a?
       [encoder/filter chain]
       [hls output]
```

The `-re` flag is critical: without it, FFmpeg reads the file as fast as possible and HLS segments come out at impossibly high speed. With `-re`, the file plays at native rate.

**D4. Loop / play once / play list.** A small sub-form: loop the file forever, play once and stop, or play a queue of files (FFmpeg concat demuxer). For v1, ship "loop forever" and "play once."

**D5. Disable irrelevant settings when in file mode.** No capture FPS, no draw mouse, no monitor index. The constraint engine handles this trivially (file mode disables those fields).

**D6. Audio mixer (Phase E) gets a "File audio" source automatically when in file mode.**

---

### Phase E — Audio capture redesign

This is the largest single piece of work. Doing it well requires a small native helper on Windows.

**E1. Define the audio model.**

An `AudioSource` is one of:
- `microphone` — a WASAPI capture device (default mic, USB mic, etc.)
- `desktop` — a WASAPI loopback device (default playback device's loopback)
- `process_include` — Windows process-loopback capturing only the audio of one specified process tree (game audio only)
- `process_exclude` — full desktop loopback minus one or more specified process trees (everything but Discord)
- `file` — audio stream of the active video file source (only valid in file mode)

Each source has: `id`, `kind`, `label`, `targetProcessName?`, `targetPid?`, `gain (0-200%)`, `muted`, `enabled`.

**E2. Native helper for per-process loopback (Windows-specific).**

Windows 10 build 19041+ exposes `AUDCLNT_STREAMOPTIONS_RAW` / process-loopback via the `IAudioClient` activation parameters (`PROCESS_LOOPBACK_MODE_INCLUDE_TARGET_PROCESS_TREE` and `PROCESS_LOOPBACK_MODE_EXCLUDE_TARGET_PROCESS_TREE`). FFmpeg does **not** wrap this. Two implementation choices:

- **Option A: Ship a small native exe** (Rust or C++) that reads PCM from a process-loopback session and writes raw PCM to stdout. FFmpeg then ingests it via `-f s16le -ar 48000 -ac 2 -i pipe:0`. The exe is invoked once per `process_include`/`process_exclude` source. Each FFmpeg input is a separate pipe.

- **Option B: A Node N-API native module** that exposes `startProcessLoopback({ pid, mode }) → ReadableStream`. We pipe the stream into FFmpeg. Cleaner integration but more build complexity.

Recommend Option A for v1: simpler, debuggable, and the binary can be built once per arch in CI.

The helper exposes a small JSON-RPC interface over stdin (or accepts CLI args) so the renderer can:
- `list-audio-sessions` → returns `{ pid, exeName, displayName, isAudible }[]`
- `capture --pid=<pid> --mode=include|exclude` → starts streaming PCM to stdout

**E3. Mixing the sources together in FFmpeg.**

For N audio sources, build:

```
-f s16le -ar 48000 -ac 2 -i pipe:N    (one per process-loopback source)
-f dshow -i audio="<mic>"             (microphone)
-f wasapi -i ""                       (default desktop loopback) // or via the helper
[1:a]volume=Vmic[a1];
[2:a]volume=Vdesk[a2];
[3:a]volume=Vgame[a3];
[a1][a2][a3]amix=inputs=3:duration=first:dropout_transition=0[aout]
-map [aout] -c:a aac -b:a 192k -ac 2 -ar 48000
```

Plumbing N stdin pipes into a single FFmpeg child requires using `stdio: ['ignore', 'pipe', 'pipe', 'pipe', 'pipe', ...]` and feeding `pipe:3`, `pipe:4`, etc. That works on Node child_process.

**E4. Audio mixer UI.**

- One row per detected source.
- Add-source button shows a dropdown of available sources (microphones, default desktop, "Capture audio from app...", "Mute audio from app...").
- Per-row controls: enable/disable, gain slider, level meter (animated from peak values reported by FFmpeg's `astats` filter or the helper).
- Drag to reorder (purely cosmetic).
- Inline help: when a user adds two sources that capture overlapping audio (e.g. desktop + game-include for the same game), warn about double-audio.

**E5. Constraints.**

- `process_include` and `process_exclude` are mutually exclusive for the same target.
- A `desktop` source plus a `process_exclude` for app X is the supported way to "mute one app." A `desktop` source plus a `process_include` for app X is wrong (it'll double up).
- The constraint engine surfaces these as warnings.

**E6. macOS / Linux fallback.**

Phase E1's model still applies, but on macOS only `microphone` and `desktop` (via BlackHole or ScreenCaptureKit, depending on capability) are practically available. Per-app loopback is not supported by Apple's APIs as of this writing. The UI hides the "Capture audio from app..." option on non-Windows.

---

### Phase F — Server-driven adaptive control

The streamer's stream parameters should be lowered (never raised) in response to actual viewer capabilities.

**F1. Define the protocol.**

A new WebSocket channel per session: `/live/api/{sessionId}/control` (server → streamer push). Messages are small JSON:

```jsonc
// server → streamer
{
  "type": "viewer-summary",
  "viewerCount": 12,
  "minDownlinkMbit": 4.5,
  "supportedCodecs": ["h264"],          // intersection across all viewers
  "maxResolution": { "w": 1920, "h": 1080 },
  "maxFps": 60
}

// server → streamer
{
  "type": "recommended-settings",
  "videoBitrate": 4000000,
  "videoCodec": "h264_nvenc",
  "outputWidth": 1280,
  "outputHeight": 720,
  "fps": 30,
  "reason": "lowest viewer downlink 4.5 Mbit/s, 2 viewers can only decode h264"
}

// streamer → server
{
  "type": "ack",
  "applied": true,
  "actualSettings": { ... },
  "clampedBy": "user-initial-ceiling"   // or "applied-as-suggested"
}
```

**F2. Viewer side: collect capabilities and report them.**

In the player page (web), on player-attach:

- Use `navigator.mediaCapabilities.decodingInfo({ ... })` for each candidate codec (h264 baseline, h264 high, hevc, av1) to determine actual support. This is more accurate than user-agent sniffing.
- Use HLS.js's bandwidth estimator (or the `Network Information API` as a hint) to report `downlinkMbit`.
- Report viewport size as `maxResolution`.
- Send a single capability message on connect, plus updates if bandwidth deteriorates (HLS.js fires events when the level drops).

The server aggregates per-session and emits `viewer-summary` to the streamer's control channel.

**F3. Server side: derive recommended settings.**

In the live runtime (`server/src/live/`), maintain per-session viewer state:

```
viewerSet: Set<{ id, downlinkMbit, supportedCodecs, viewport }>
```

On any change, recompute:

```
minDownlink = min(viewer.downlinkMbit) * 0.7   // safety margin
codecs      = intersection(viewer.supportedCodecs)
maxRes      = max(viewport)                    // we never upscale
maxFps      = 60 if all viewers can handle it, else 30
```

Then translate to a recommendation respecting the streamer's *initial ceiling* (sent at session start as part of the create-session payload):

```
recommendedBitrate    = clamp(minDownlink * 0.8, 500k, initialBitrate)
recommendedResolution = pick from a fixed ladder ≤ initialResolution and ≤ maxRes
recommendedCodec      = pick from initialCodec's family that is in `codecs`
```

Push as `recommended-settings` only when the recommendation is meaningfully different from current (>10% change or new codec).

**F4. Streamer side: applying recommendations.**

The Electron main process holds the active stream. On `recommended-settings`:

1. Compute clamped settings: `final[k] = min(current[k], recommended[k])` for each numeric field. For codec, switch only if the recommended codec is in the same family or a lower-complexity family (no h264 → hevc upgrades).
2. If `final` differs meaningfully from current, **respawn FFmpeg** with the new params. HLS handles this with an `EXT-X-DISCONTINUITY` tag in the playlist (FFmpeg's `-hls_flags` already includes the right flags; segment numbering must continue across the respawn — track `next_segment_start_number` like the Python `streaming_tool/serve.py` does).
3. Send `ack` with the applied settings and which fields were clamped.

**F5. UI.**

A "Live status" panel visible only while streaming:

```
Viewers: 12
Network constraint: 4.5 Mbit/s minimum (1 viewer on cellular)
Codec constraint: h264 only (3 viewers on iOS Safari)

Currently streaming at:
  1280×720 @ 30fps, 4 Mbit/s, h264_nvenc

Initial ceiling:
  1920×1080 @ 60fps, 8 Mbit/s, h264_nvenc

[Disable auto-adaptation]
```

A toggle lets the user disable auto-adaptation entirely (useful for testing or "I want quality, viewers can buffer").

**F6. Manual override.**

Manual changes during a live stream are honored, but they can never *exceed* the initial ceiling. The constraint engine enforces this: the upper bound for every numeric field becomes the value at session start, not the codec's theoretical max.

**F7. The "lower-only" guarantee.**

Strictly enforced both client and server:
- Server's `recommended-settings` payload is computed against the streamer-provided `initialCeiling`.
- Client double-checks before applying.
- Out-of-range messages are logged and ignored.

---

### Phase G — Telemetry and logging

To know whether any of this works in the wild:

**G1.** Per-session log dump on stop: settings used, viewer count over time, codec/bitrate changes, FFmpeg process restarts, upload pass durations (Plan 03), latency estimates.

**G2.** Optional opt-in "send anonymous diagnostics to Rebound" toggle — without that, the log stays local.

**G3.** A `Stream health` mini-widget (during streaming) that surfaces FFmpeg's `speed=` value, last upload pass duration, and dropped-frames count. Three colored states (good/warn/bad) with thresholds.

---

## Code organization & implementation notes

This plan replaces a 1041-line `electron-live-stream.js` and a single tall settings page with a feature directory in the renderer and a streaming subsystem in the main process. The split is intentional: **renderer = UI + state, main = capture/encode/upload/IPC, native helpers = OS-specific edges**.

### Top-level layout

```
src/features/streaming/                     -- renderer (React)
  ui/
    StreamingPage.jsx                       -- thin shell that composes panels
    panels/
      SourcePanel.jsx
      AudioMixer.jsx
      OutputPanel.jsx
      AdvancedPanel.jsx
      LiveStatusPanel.jsx
    controls/
      FieldWithConstraint.jsx               -- input + constraint badge + tooltip
      ProfileSelector.jsx
      ResolutionPicker.jsx
      BitratePicker.jsx
      CodecPicker.jsx
    hooks/
      useStreamSettings.js                  -- wraps settings IPC; exposes [s, set, reset]
      useCapabilities.js                    -- wraps capability IPC
      useLiveControl.js                     -- subscribes to server control channel
      useStreamLifecycle.js                 -- start/stop, status
      useConstraints.js                     -- runs constraint engine on (settings, capabilities)
    formatters/
      bitrate.js, resolution.js, latency.js -- pure display helpers
  state/
    settingsReducer.js                      -- pure reducer; no IPC
    derivedFields.js                        -- gopSize-follows-fps, etc.
  __tests__/                                -- mirrors structure above

src/lib/streaming/                          -- shared business logic (renderer only)
  constraints/
    index.js                                -- runs all constraints, returns Map<field, ConstraintResult[]>
    videoCodec.js
    nvenc.js
    audio.js
    resolution.js
    bitrate.js
    initialCeiling.js                       -- enforces "lower only" while streaming
  profiles/                                 -- mirrored copy of main-process profiles for UI use
  detectProfile.js
  autoOptimize.js                           -- pure: (capabilities) => Settings
  validators.js                             -- pure value validators (used by reducer + IPC)

shared/streaming/types.js                   -- JSDoc typedefs used by renderer AND main
shared/streaming/protocol.js                -- WebSocket message types + version constant

public/streaming/                           -- main process (Electron)
  capabilities/
    probe.js                                -- top-level orchestrator
    ffmpegCheck.js                          -- runs `ffmpeg -hwaccels`, `-encoders`, `-filters`
    gpuDetect.js                            -- Win32: WMIC / CIM; macOS: system_profiler
    audioDevices.js                         -- platform-specific enumeration
    displays.js                             -- via Electron `screen` API
  settings/
    store.js                                -- atomic write to userData/stream-settings.json
    schema.js                               -- JSDoc types + version constant
    migrate.js                              -- versioned step runner
    steps/                                  -- one file per migration step
  capture/                                  -- (Plan 01 split)
    gfxcapture.js, gfxcaptureCuda.js, gdigrab.js, avfoundation.js, x11grab.js
    file.js                                 -- new: video file source mode (-re, -stream_loop)
  encoder/                                  -- (Plan 01 split)
    nvenc.js, qsv.js, videotoolbox.js, software.js
    _vbv.js                                 -- (Plan 04)
  audio/
    sources/
      microphone.js                         -- builds dshow/avfoundation input args
      desktopLoopback.js
      processInclude.js                     -- talks to native helper
      processExclude.js                     -- talks to native helper
      fileAudio.js
    filterGraph.js                          -- builds amix/amerge filter from N sources
    levelMeter.js                           -- parses astats output, emits IPC events
  output/
    hls.js                                  -- (from Plan 01 split)
  uploader/                                 -- (Plan 03 split)
  server-control/
    socket.js                               -- WebSocket client to /live/api/<id>/control
    handlers/
      viewerSummary.js
      recommendedSettings.js
    adapter.js                              -- maps recommendations to clamped settings
    initialCeiling.js                       -- single source of truth for "lower only"
  pipeline.js                               -- composes capture + filters + encoder + audio + output
  process.js                                -- spawn/lifecycle/respawn-with-discontinuity
  manager.js                                -- top-level orchestrator (replaces ElectronLiveStreamManager)
  ipc.js                                    -- registers all `live-stream:*` IPC handlers

native-helpers/
  windows-process-loopback/
    src/                                    -- Rust or C++
    Cargo.toml | CMakeLists.txt
    README.md                               -- protocol, build, version
```

### Cross-process boundaries

There are exactly **three** boundaries; everything else is internal:

1. **Renderer ↔ Main (IPC)** — all IPC channels are namespaced under `live-stream:*` and live in `public/streaming/ipc.js`. The renderer only ever talks to IPC through hooks in `src/features/streaming/ui/hooks/`. **Components do not call `window.electronAPI` directly.** That rule, enforced in code review, is what keeps the renderer from accumulating IPC spaghetti.

2. **Main ↔ Native helper (stdin/stdout)** — the Windows process-loopback helper is an exe spawned by `public/streaming/audio/sources/processInclude.js` (etc.). Communication is line-delimited JSON on stdin and raw PCM on stdout. The protocol is documented in `native-helpers/windows-process-loopback/README.md` with a version constant; mismatched versions fail loudly.

3. **Streamer ↔ Server (WebSocket)** — message shapes live in `shared/streaming/protocol.js` with a `PROTOCOL_VERSION` constant exchanged in the connect handshake. Both the streamer client (`public/streaming/server-control/`) and the server handler (`server/src/live/control/`) import from the same file.

Putting the protocol shape in `shared/` and importing it from both sides means a wire-format change is one PR that updates the type, the sender, and the receiver — not three separate PRs that drift.

### Renderer architectural rules

- **Hooks own IPC.** Components import hooks. If a component touches `ipcRenderer` directly, it's a bug.
- **Reducers are pure.** `settingsReducer.js` is a pure `(state, action) => state` function. Persistence is a side effect handled by `useStreamSettings`'s `useEffect`, not the reducer.
- **Constraints are pure.** Each constraint file in `src/lib/streaming/constraints/` exports a function `(settings, capabilities) => ConstraintResult[]`. Adding a constraint = adding a file and a one-line registration. No edits to existing constraints.
- **No business logic in JSX.** If a component needs a value computed from settings, that computation lives in `formatters/` or `state/derivedFields.js`. JSX is for layout.

### Main-process architectural rules

- **Pure argv builders** in `capture/`, `encoder/`, `output/`, `audio/filterGraph.js`. They take a config and return string arrays. They do not spawn, log, or touch the disk.
- **Side effects isolated.** Process spawn lives in `process.js`. File I/O lives in `uploader/fileSource.js` and `settings/store.js`. Network I/O lives in `uploader/httpClient.js` and `server-control/socket.js`. Nowhere else.
- **The manager is thin.** `manager.js` is an orchestrator: it holds the lifecycle state machine, calls into the subsystems, and forwards events. It does not build argv, write files, or speak HTTP. Target: ≤300 lines.
- **One module = one responsibility.** ≤200 lines per file. If a file grows past that, split it.

### Type discipline (JSDoc)

The project is JS. To get most of the safety of TS without changing tooling, define typedefs in `shared/streaming/types.js`:

```js
/** @typedef {Object} StreamSettings ... */
/** @typedef {Object} Capabilities ... */
/** @typedef {Object} AudioSource
 *  @property {string} id
 *  @property {"microphone"|"desktop"|"process_include"|"process_exclude"|"file"} kind
 *  @property {string} label
 *  @property {number=} targetPid
 *  @property {string=} targetProcessName
 *  @property {number} gain
 *  @property {boolean} muted
 *  @property {boolean} enabled
 */
/** @typedef {Object} ConstraintResult
 *  @property {string} field
 *  @property {"ok"|"warn"|"error"} severity
 *  @property {string} message
 *  @property {() => Partial<StreamSettings>=} fix   -- optional auto-fix factory
 */
/** @typedef {Object} ViewerSummary ... */
/** @typedef {Object} RecommendedSettings ... */
```

Configure VS Code/`jsconfig.json` for `checkJs: true` so these types are enforced on save.

### Per-phase code-organization notes

**Phase A (capabilities)** — `probe.js` is an orchestrator that calls `ffmpegCheck`, `gpuDetect`, `audioDevices`, `displays` in parallel (`Promise.all`) and merges results. Each sub-detector is a one-job module and has its own platform-specific implementation behind a `platform/` folder when needed:

```
public/streaming/capabilities/gpuDetect/
  index.js          -- dispatches by platform
  win32.js          -- WMIC / Get-CimInstance
  darwin.js         -- system_profiler
  linux.js          -- lspci
```

Renderer reads cached probe via `useCapabilities()`. Re-probe button calls `ipc.invoke('capabilities:reprobe')` and refreshes.

**Phase B (settings)** — see Plan 02 for migration step pattern. `store.js` writes atomically (`fs.writeFile` to `*.tmp` + `fs.rename`). The renderer never touches the file directly.

**Phase C (UI + constraints)** — the constraint engine is the architectural heart. Adding a new rule must be:

1. Create `src/lib/streaming/constraints/myNewRule.js` exporting one function.
2. Register it in `src/lib/streaming/constraints/index.js`.
3. Add a test in `__tests__/`.

That's it. No edits to `useConstraints`, no edits to UI components. Components just render whatever `useConstraints()` says about their field.

The `FieldWithConstraint` component is the universal wrapper:

```jsx
<FieldWithConstraint name="videoBitrate">
  <BitratePicker />
</FieldWithConstraint>
```

It reads the constraint result for `name` from context, renders the appropriate badge/tooltip, and passes `disabled`/`error`/`warning` props to its child.

**Phase D (file source)** — `public/streaming/capture/file.js` exports `buildArgs({ file, loop })` returning `["-re", ...(loop ? ["-stream_loop", "-1"] : []), "-i", file]`. The pipeline composer recognizes this branch and skips capture-backend args entirely.

**Phase E (audio)** — the **single biggest design point** is that audio sources are uniform. Every source kind exports the same shape:

```js
// public/streaming/audio/sources/microphone.js (and every sibling)
/** @type {(source: AudioSource) => { argv: string[], pipe?: { fd: number, stream: Readable } }} */
export function buildInput(source) { ... }
```

`pipe` is present only for sources that stream PCM through a pipe (process-loopback). The composer in `audio/filterGraph.js` collects all `argv` arrays, assigns `pipe` slots (`pipe:3`, `pipe:4`, ...), and builds the `amix`/`amerge` filter graph with consistent input labels.

This means adding a new audio source kind in the future (e.g. NDI, Voicemeeter) is a single file in `audio/sources/` plus one registration line — same open-closed pattern as constraints and profiles.

The native helper communicates over a versioned, line-delimited JSON protocol on stdin and raw PCM on stdout. The wrapper module (`processInclude.js`) is the only code in the repo that knows about the helper's existence; everything else sees a `Readable` stream.

**Phase F (server control)** — strictest separation, because this code crosses a network boundary:

```
shared/streaming/protocol.js                  -- message shapes + PROTOCOL_VERSION
public/streaming/server-control/
  socket.js                                   -- connect/reconnect/heartbeat; emits typed events
  handlers/
    viewerSummary.js                          -- pure: server msg → renderer event
    recommendedSettings.js                    -- pure: server msg → adapter call
  adapter.js                                  -- pure: (recommendation, current, ceiling) → final settings
  initialCeiling.js                           -- captured at session start; immutable for the session
server/src/live/control/
  socketServer.js                             -- WebSocket server endpoint
  viewerStore.js                              -- per-session viewer state
  recommend.js                                -- pure: viewerSet → recommendation
  push.js                                     -- pushes to streamer when recommendation changes
```

`adapter.js` and `recommend.js` are both pure functions. They're the ones we test exhaustively. The IO modules (`socket.js`, `socketServer.js`) are thin and forward messages to the pure layer.

**The "lower only" guarantee** is enforced in `adapter.js`:

```js
export function applyRecommendation(current, recommendation, ceiling) {
  return {
    videoBitrate: clampDown(current.videoBitrate, recommendation.videoBitrate, ceiling.videoBitrate),
    outputWidth:  clampDown(current.outputWidth,  recommendation.outputWidth,  ceiling.outputWidth),
    // ... etc
  };
}
const clampDown = (cur, rec, ceil) => Math.min(cur, rec ?? cur, ceil);
```

Server applies the same clamp before sending. Belt and suspenders.

**Phase G (telemetry)** — a single `public/streaming/telemetry/recorder.js` collects events from all subsystems via an event emitter. On stop, it writes a JSON dump to `userData/sessions/<sessionId>.json`. Opt-in upload reads that file. The recorder doesn't know what events mean — it's a structured log.

### Testing strategy

- **Pure modules** (constraints, argv builders, planners, adapters, recommend) — unit tests with no fakes. Snapshot tests for argv.
- **Pure renderer state** (reducers, derived fields, formatters) — unit tests.
- **Hooks** — React Testing Library + a fake IPC.
- **IPC handlers** — call them directly with synthetic args; assert side effects.
- **Integration** — one harness per phase that wires real modules with fake I/O. E.g., a server-control integration test that runs both `server/src/live/control/recommend.js` and `public/streaming/server-control/adapter.js` end-to-end with synthetic viewer state.
- **Native helper** — its own test suite in `native-helpers/windows-process-loopback/` plus a smoke test in CI on Windows runners.

### Naming and module conventions

- Files in `kebab-case.js`, exports in `camelCase`. JSX components in `PascalCase`.
- One default export per file when the module is "a thing" (a component, a profile). Named exports otherwise.
- Test files live in `__tests__/` next to source, with mirrored structure.
- No barrel re-exports across feature boundaries (so we can rename internals without ripple).
- Imports ordered: stdlib → third-party → `shared/` → `src/` → relative.

## Migration & rollout

- Phase A and B can ship together; they're invisible plumbing.
- Phase C ships behind a feature flag for one release so we can A/B against the existing UI. Default it on after one release of dogfooding.
- Phase D is small and can ship with C or alone.
- Phase E ships alone. The native helper needs CI build infrastructure; budget the time for that.
- Phase F is the largest and depends on the WebSocket/control protocol being well-specified before either side starts. Recommend a short design doc + an internal protocol version before coding either side.
- Phase G can ship piecemeal alongside any other phase.

## Validation

- **Phase A/B:** persistence survives crash, app update, and OS restart. Probe runs in <500 ms on a warm disk.
- **Phase C:** every existing FFmpeg-error path that we've seen in support tickets is now blocked at the UI level (write a test fixture per known bad combo).
- **Phase D:** stream a local 1080p60 mp4 for 10 minutes; verify the produced HLS plays correctly and segment cadence matches `hls_time`.
- **Phase E:** capture mic + desktop + game-include in three concurrent sources; verify levels are correct, no double-audio, mute works in real time.
- **Phase F:**
  - Stream at 8 Mbit; open the player on a throttled network (Chrome devtools) at 2 Mbit; observe the streamer respawn at ≤2 Mbit within ~3–5 seconds.
  - Open a second viewer at 1 Mbit; observe a further drop.
  - Close both viewers; observe the streamer does NOT raise above the initial ceiling.
  - Manually set a value above the initial ceiling; UI rejects it.
- **Phase G:** verify the health widget shows accurate values during artificial stalls (drop the ffmpeg process or pull the network).
