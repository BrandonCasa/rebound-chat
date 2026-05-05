# Plan 04: Streaming UI rewrite, capability-aware settings, audio redesign, and server-driven adaptation

## Update (2026-05-04)

- The streaming pipeline split is already present (`public/streaming/pipeline.js`, encoder modules, profiles, defaults, and tests), so this plan should avoid redoing that work.
- Plan 03 extraction (`public/streaming/uploader/`) is not landed yet, so anything that assumes a fully isolated uploader should be treated as "after Plan 03 step 6".
- `public/streaming/types.js` already carries key fields from Plans 01-02 (`vbvMultiplier`, profile-oriented settings), so Phase C can consume current types first and postpone type relocation to `shared/` until both renderer and main actually need cross-process imports.

### Updated execution priorities

1. Ship Phase A (capability probe) + Phase B (settings persistence) first as non-UI-risk infrastructure.
2. Do a minimal Phase C pass that introduces auto-optimized vs advanced controls in the existing route before full component extraction.
3. Land Phase D (file source mode) early because it is isolated and high user value.
4. Gate Phase E (Windows per-process audio helper) behind a feature flag and ship desktop/mic mixer baseline first.
5. Start Phase F (server-driven adaptation) only after Plan 03 scheduler + pass logging is live so adaptation decisions have reliable timing signal.

## Status of prerequisites

- **Plan 01** (NVENC defaults + quality profile system): Must be complete. The `public/streaming/profiles/` system and updated `defaults.js` are inputs to Phase C's auto-optimize and constraint engine.
- **Plan 02** (VBV bufsize): Must be complete. The `vbvMultiplier` field in `StreamConfig` and `defaults.js` must exist before Phase C exposes the advanced VBV knob.
- **Plan 03** (parallel uploads): Must be complete. `public/streaming/uploader/` must be extracted and self-contained before this plan wires it into the new manager.

The streaming pipeline module split (`public/streaming/capture/`, `encoder/`, `output/hls.js`, `filters/videoFilter.js`, `pipeline.js`, `platform/profiles.js`, `presets.js`, `types.js`, `defaults.js`) is already in place.

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

6. **Server has no say in the stream's parameters.** Today the streamer sets it once at start. There is no channel from the server back to the streamer to say "your viewers can only handle h264 at 4 Mbit."

## Why this should be fixed

- New users get scared by the current settings page and either pick blindly or churn.
- "Settings combos that crash FFmpeg" is a constant support pattern.
- Without persistence, every restart costs the user a re-configuration session.
- File-source streaming is a high-value, low-effort feature that broadens the product.
- Per-app audio control is a genuine differentiator.
- Server-driven adaptation is the only architecturally correct way to handle a viewer base with mixed devices.

## Expected result

- A settings UI organized into a **simple "Auto-optimized" path** (default) and an **advanced manual path** (collapsed by default).
- The UI **cannot let the user pick an invalid combo.** Disabled-by-constraint options are visibly disabled with a tooltip explaining why.
- Settings persist across app restarts. A "Reset to defaults" button is one click away.
- A **Source picker** with three modes: **Screen / Window / Video file**.
- An **Audio mixer** UI showing every detected audio source with per-source mute, level, and an "exclude this app" toggle.
- A **Live status panel** during streaming showing viewer count, current parameters, what changed since stream start, and why.
- The streamer's actual stream parameters can be **lowered automatically** in response to viewer constraints. They never exceed what the user originally selected.

## How to fix

This is a multi-phase project. Phases are ordered so each one ships value on its own and unblocks the next.

---

### Phase A — System capability probe (foundation for everything else)

Before redesigning the UI, the app needs to know what the user's machine can do. Note: this probe is also the foundation for Plan 05 Phase H (GPU profiling). The two plans share the same probe output.

**A1. Add a `capabilities.js` module in the Electron main process.** On app start (and on demand from a "Re-probe" button), it runs:

- `os.platform()`, `os.arch()`, `os.cpus()`, `os.totalmem()`
- `ffmpeg -hide_banner -hwaccels` → parse out `cuda`, `d3d11va`, `qsv`, `videotoolbox`, etc.
- `ffmpeg -hide_banner -encoders` → parse the list, intersect with our supported codec list
- `ffmpeg -hide_banner -filters` → check for `gfxcapture`, `scale_cuda`, `hwmap`, `amix`, `amerge`
- On Windows: query the GPU via PowerShell `Get-CimInstance Win32_VideoController`
- On Windows: enumerate display modes per monitor
- Display device enumeration via Electron's `screen.getAllDisplays()`
- Audio device enumeration (Phase E uses this)

The probe writes its result to `app.getPath('userData')/capabilities.json` so the renderer can read it synchronously on UI mount.

**A2. Define a typed capability shape.** The renderer consumes one well-defined object. Add to `public/streaming/types.js`:

```js
/** @typedef {Object} DetectedCapabilities
 *  @property {NodeJS.Platform} os
 *  @property {string} arch
 *  @property {{ vendor: string, model: string, driver: string }} gpu
 *  @property {{ nvenc: { h264: boolean, hevc: boolean, av1: boolean }, qsv: {...}, amf: {...}, videotoolbox: {...} }} encoders
 *  @property {string[]} captureBackends
 *  @property {Object[]} audioDevices
 *  @property {Object[]} displays
 */
```

Note: `public/streaming/types.js` currently defines `Capabilities` (the lightweight runtime fast-path flag). The new `DetectedCapabilities` is richer and produced by the probe. During this plan, move `public/streaming/types.js` to `shared/streaming/types.js` so it can be imported by both renderer and main process without duplication. The `StreamingProfile` typedef from Plan 01 also moves here.

**A3. Expose probe via IPC.** Add `ipcMain.handle('capabilities:get', ...)` and `'capabilities:reprobe'`. The renderer wraps these in a hook (`useCapabilities`).

---

### Phase B — Settings persistence and "Clear saved settings"

**B1. Storage location.** `app.getPath('userData')/stream-settings.json`. Atomic writes (write to `.tmp` then `rename`) so a crash mid-write doesn't corrupt.

**B2. Versioned schema.** First field of every settings file is `schemaVersion: 1`. Future migrations live in `migrateSettings(raw)` and bump the version.

**B3. Migration step from pre-persistence defaults.** When the settings file does not exist (first launch with this plan installed), run the auto-optimizer (Phase C3) to produce the initial settings for this machine. There is no manual migration from old defaults because there was no persistence before this plan.

**B4. Two IPC handlers.** `settings:load` and `settings:save`. Save throttled to once per second to avoid disk thrash on rapid form changes.

**B5. Renderer hook.** `useStreamSettings()` returns `[settings, updateSettings, resetSettings]`. `resetSettings()` writes the auto-optimized defaults and shows a confirmation dialog.

**B6. Two-tier defaults.** "Defaults" means the auto-optimized values for *this machine*, not a hardcoded constant. So `Reset` doesn't drop a Windows + RTX user back into a generic config — it re-runs the optimizer.

**File layout:**

```
public/streaming/settings/
  store.js          -- atomic write to userData/stream-settings.json
  schema.js         -- JSDoc types + schemaVersion constant
  migrate.js        -- versioned step runner
  steps/
    v0_to_v1.js     -- (if needed in future)
```

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

**C2. Constraint engine.** Centralize all validity rules in `src/lib/streaming/constraints/`. Each constraint is a function `(settings, capabilities) => ConstraintResult[]`. Examples:

- `videoCodec` must be in `capabilities.encoders.<family>.<codec>`. NVENC codecs filtered out if no NVIDIA GPU detected.
- `nvencTune === 'ull'` ⇒ `nvencLookahead` should be 0 and `multipass` should be 'disabled'. Yellow warning + "fix automatically" link if user sets otherwise.
- `nvencTemporalAq` requires `nvencLookahead > 0`.
- `gopSize` recommended to equal `fps × hlsTime`. Soft warning.
- `convertStreamToSdr` requires `zscale` and `tonemap` filters in capabilities.
- `captureBackend === 'gfxcapture'` requires Windows + the filter present.
- `vbvMultiplier` bounded to `[0.25, 4.0]`.

The engine returns a `Map<fieldName, ConstraintResult[]>`. The form layer reads it to disable hard-invalid options, show cautions, and provide "Fix automatically" affordances.

**C3. Auto-optimize function.**

`autoOptimize(capabilities)` is a pure function that produces a `StreamSettings` object given the system capabilities. It uses the quality profile system from Plan 01 to apply the appropriate profile:

```
if has NVIDIA RTX 20+:
  videoCodec = "h264_nvenc"
  apply "low-latency" profile (from Plan 02)
  vbvMultiplier = 1.0
elif has Intel Arc / iGPU with QSV:
  videoCodec = "h264_qsv"
  encoderPreset = "veryfast"
elif macOS Apple Silicon:
  videoCodec = "h264_videotoolbox"
elif fallback:
  videoCodec = "libopenh264"
  encoderPreset = "default"

resolution = min(primary display res, 1920x1080)
fps        = min(primary display refresh, 60)
bitrate    = pick by resolution: 1080p60=8M, 1080p30=6M, 720p60=5M, 720p30=3M
captureBackend = "gfxcapture" if Win+RTX else "gdigrab" if Win else native
audioInputs = [primary mic, default desktop loopback]
hlsTime    = 2; gopSize = fps * hlsTime
```

**C4. Profile selector and detectProfile.**

The `detectProfile.js` logic deferred from Plan 01 lives here. After every settings change in `useStreamSettings`, run `detectProfile(settings)` — walks the quality profile list from Plan 02, returns the first complete match or `"custom"`. Used to display the active profile name in the selector and to know whether to offer "Apply Low Latency" affordances.

`ProfileSelector.jsx` in `src/features/streaming/ui/controls/` is the presentational component. Takes `value` + `onChange` + `profiles` list.

**C5. Field-by-field tooltips.** Every advanced field has a one-sentence explanation. Latency-sensitive fields marked with a clock icon.

---

### Phase D — Video file streaming as a source mode

**D1. Source picker.** Add the third radio (`Video file`) to the source picker. Selecting it shows a file picker with filters for `.mp4`, `.mkv`, `.mov`, `.webm`, `.ts`.

**D2. Probe the file with ffprobe.** Validate it has a video stream, capture native width/height/fps/codec/audio.

**D3. New input branch.** Add `public/streaming/capture/file.js` (new file, not part of Plan 01's split):

```js
/** @type {(source: { filePath: string, loop: boolean }) => string[]} */
export function buildArgs({ filePath, loop }) {
  return ["-re", ...(loop ? ["-stream_loop", "-1"] : []), "-i", filePath];
}
```

`pipeline.js` recognizes the `captureBackend === 'file'` branch and skips standard capture-backend args entirely.

**D4. Loop / play once.** For v1: loop forever or play once.

**D5. Disable irrelevant settings in file mode.** No capture FPS, no draw mouse, no monitor index. Constraint engine handles this automatically (file mode forces those fields disabled).

---

### Phase E — Audio capture redesign

**E1. Define the audio model.** Add to `shared/streaming/types.js`:

```js
/** @typedef {Object} AudioSource
 *  @property {string} id
 *  @property {"microphone"|"desktop"|"process_include"|"process_exclude"|"file"} kind
 *  @property {string} label
 *  @property {string=} targetProcessName
 *  @property {number=} targetPid
 *  @property {number} gain
 *  @property {boolean} muted
 *  @property {boolean} enabled
 */
```

**E2. Native helper for per-process loopback (Windows-specific).**

Windows 10 build 19041+ exposes process-loopback via `IAudioClient` activation parameters. FFmpeg does not wrap this. Ship a small native exe (Rust or C++) that reads PCM from a process-loopback session and writes raw PCM to stdout. FFmpeg ingests it via `-f s16le -ar 48000 -ac 2 -i pipe:0`. The exe is invoked once per `process_include`/`process_exclude` source.

The helper exposes a small JSON-RPC interface over stdin:
- `list-audio-sessions` → returns `{ pid, exeName, displayName, isAudible }[]`
- `capture --pid=<pid> --mode=include|exclude` → starts streaming PCM to stdout

**E3. Mixing the sources together in FFmpeg.** For N audio sources:

```
-f s16le -ar 48000 -ac 2 -i pipe:N    (one per process-loopback source)
-f dshow -i audio="<mic>"             (microphone)
-f wasapi -i ""                       (default desktop loopback)
[1:a]volume=Vmic[a1];
[2:a]volume=Vdesk[a2];
...
[a1][a2]amix=inputs=2:duration=first:dropout_transition=0[aout]
-map [aout] -c:a aac -b:a 192k -ac 2 -ar 48000
```

Add `public/streaming/audio/filterGraph.js` that builds the `amix` filter from N sources using the same open-closed pattern as constraints and profiles.

**E4. Audio mixer UI.** One row per detected source. Add-source button. Per-row: enable/disable, gain slider, level meter (from FFmpeg's `astats` or the helper). Double-audio warning when sources overlap.

**E5. Constraints.**
- `process_include` and `process_exclude` are mutually exclusive for the same target.
- `desktop` + `process_exclude` for app X = "mute one app" (correct).
- `desktop` + `process_include` for app X = double-audio (constraint warning).

**E6. macOS / Linux fallback.** Only `microphone` and `desktop` practically available. UI hides per-app options on non-Windows.

---

### Phase F — Server-driven adaptive control

**F1. Define the protocol.** Add `shared/streaming/protocol.js` with a `PROTOCOL_VERSION` constant. A new WebSocket channel per session: `/live/api/{sessionId}/control` (server → streamer push). Messages:

```jsonc
// server → streamer
{ "type": "viewer-summary", "viewerCount": 12, "minDownlinkMbit": 4.5,
  "supportedCodecs": ["h264"], "maxResolution": { "w": 1920, "h": 1080 } }

// server → streamer
{ "type": "recommended-settings", "videoBitrate": 4000000, "videoCodec": "h264_nvenc",
  "outputWidth": 1280, "outputHeight": 720, "fps": 30,
  "reason": "lowest viewer downlink 4.5 Mbit/s, 2 viewers can only decode h264" }

// streamer → server
{ "type": "ack", "applied": true, "actualSettings": { ... }, "clampedBy": "user-initial-ceiling" }
```

**F2. Viewer side — automatic capability probe.**

Add `src/features/player/viewerProbe.js`. On page load it runs a synchronous and async probe and returns a `ViewerCapabilities` object. Results are reported to the server immediately on WebSocket connect and re-reported whenever the network or bandwidth estimate changes materially.

**F2a. Codec probe — three-tier approach.**

Run all three tiers and merge; later tiers fill in richer signal but are not required.

*Tier 1 — `MediaSource.isTypeSupported` (synchronous, broadest browser coverage)*

```js
const isSupported = (mime) =>
  typeof MediaSource !== 'undefined' && MediaSource.isTypeSupported(mime);

const CODEC_PROBES = {
  h264_baseline: 'video/mp4; codecs="avc1.42E01E"',          // H.264 Constrained Baseline 3.0
  h264_main:     'video/mp4; codecs="avc1.4D401F"',           // H.264 Main 3.1
  h264_high:     'video/mp4; codecs="avc1.640028"',           // H.264 High 4.0
  hevc_main:     'video/mp4; codecs="hev1.1.6.L93.B0"',       // HEVC Main L3.1
  hevc_main10:   'video/mp4; codecs="hev1.2.4.L120.B0"',      // HEVC Main10 (HDR)
  av1:           'video/mp4; codecs="av01.0.08M.08"',          // AV1 Main
  vp9:           'video/webm; codecs="vp9"',
  aac_lc:        'audio/mp4; codecs="mp4a.40.2"',
  opus:          'audio/webm; codecs="opus"',
};

// Result: Record<keyof CODEC_PROBES, boolean>
const tier1 = Object.fromEntries(
  Object.entries(CODEC_PROBES).map(([k, mime]) => [k, isSupported(mime)])
);
```

*Tier 2 — `navigator.mediaCapabilities.decodingInfo` (async, returns `smooth` + `powerEfficient`)*

For each `true` result from Tier 1, run a `decodingInfo` call with a representative sample config (1280×720, 30fps, 4 Mbit/s) to see if hardware-accelerated decode is available. Store `{ supported, smooth, powerEfficient }` per codec. If the API is unavailable, skip and fall back to Tier 1 booleans.

*Tier 3 — `HTMLVideoElement.canPlayType` (legacy fallback)*

Used only if `MediaSource` is undefined (very old browsers). Returns `""`, `"maybe"`, or `"probably"`.

**F2b. Network probe.**

```js
const probeNetwork = () => {
  const conn = navigator.connection ?? navigator.mozConnection ?? navigator.webkitConnection;
  return {
    downlinkMbit:    conn?.downlink    ?? null,   // Mbit/s, not always accurate
    effectiveType:   conn?.effectiveType ?? null, // '4g'|'3g'|'2g'|'slow-2g'
    rttMs:           conn?.rtt         ?? null,
    saveData:        conn?.saveData    ?? false,
  };
};
```

After HLS.js initializes, subscribe to its `FRAG_LOADED` and `LEVEL_SWITCHED` events and read `hls.bandwidthEstimate` (bits/s). Convert to Mbit/s and add as `hlsBandwidthEstimateMbit`; this is more reliable than `navigator.connection.downlink` because it is measured on the actual stream segments.

**F2c. Display probe.**

```js
const probeDisplay = () => ({
  viewportWidth:    window.innerWidth,
  viewportHeight:   window.innerHeight,
  screenWidth:      window.screen.width,
  screenHeight:     window.screen.height,
  devicePixelRatio: window.devicePixelRatio ?? 1,
});
```

**F2d. `ViewerCapabilities` typedef.** Add to `shared/streaming/types.js`:

```js
/** @typedef {Object} CodecProbeResult
 *  @property {boolean} supported
 *  @property {boolean|null} smooth          -- null if mediaCapabilities unavailable
 *  @property {boolean|null} powerEfficient
 */

/** @typedef {Object} ViewerCapabilities
 *  @property {{ h264_baseline: CodecProbeResult, h264_main: CodecProbeResult,
 *               h264_high: CodecProbeResult, hevc_main: CodecProbeResult,
 *               hevc_main10: CodecProbeResult, av1: CodecProbeResult,
 *               vp9: CodecProbeResult, aac_lc: CodecProbeResult,
 *               opus: CodecProbeResult }} codecs
 *  @property {string[]} supportedCodecFamilies   -- ["h264","hevc","av1","vp9"] — derived
 *  @property {{ downlinkMbit: number|null, effectiveType: string|null,
 *               rttMs: number|null, saveData: boolean,
 *               hlsBandwidthEstimateMbit: number|null }} network
 *  @property {{ viewportWidth: number, viewportHeight: number,
 *               screenWidth: number, screenHeight: number,
 *               devicePixelRatio: number }} display
 *  @property {string} userAgent
 *  @property {number} probedAt   -- Date.now()
 */
```

`supportedCodecFamilies` is derived: `"h264"` if any h264 tier is supported, `"hevc"` if `hevc_main` is supported, etc. This is the field the server uses in `intersection(viewer.supportedCodecs)`.

**F2e. Reporting and re-probing.**

- On WebSocket connect: run full probe (tiers 1 + 2 + network + display) and send `viewer-capabilities` message (see protocol below).
- On `navigator.connection` `change` event: re-run network probe. Send update only if `downlinkMbit` or `effectiveType` changed.
- On HLS.js `FRAG_LOADED` every 10 segments (not every fragment): refresh `hlsBandwidthEstimateMbit` and send update if it changed by >15%.
- On HLS.js `LEVEL_SWITCHED` (viewer's player dropped to a lower HLS level): always send an update immediately with `triggeredBy: "hls_level_drop"`.

**F2f. Protocol update.** Replace the `viewer-summary` message with a richer shape in `shared/streaming/protocol.js`:

```jsonc
// viewer → server  (replaces implicit connection signal)
{
  "type": "viewer-capabilities",
  "viewerId": "<uuid>",
  "supportedCodecFamilies": ["h264", "hevc"],
  "codecs": { "h264_high": { "supported": true, "smooth": true, "powerEfficient": true }, ... },
  "network": { "downlinkMbit": 18.5, "effectiveType": "4g", "rttMs": 12, "saveData": false, "hlsBandwidthEstimateMbit": null },
  "display": { "viewportWidth": 1920, "viewportHeight": 1080, "devicePixelRatio": 1 },
  "probedAt": 1714900000000,
  "triggeredBy": "connect" | "network_change" | "hls_bandwidth" | "hls_level_drop"
}

// server → streamer  (unchanged shape, now computed from richer viewer data)
{ "type": "viewer-summary", "viewerCount": 12, "minDownlinkMbit": 4.5,
  "supportedCodecs": ["h264"], "maxResolution": { "w": 1920, "h": 1080 } }
```

The server's `viewerStore.js` stores one `ViewerCapabilities` per viewer and recomputes the `viewer-summary` derived fields on every update.

**F2g. File location.** Add `src/features/player/viewerProbe.js` to the renderer file layout (§ Code organization). Export one async function `probeViewerCapabilities(): Promise<ViewerCapabilities>` and one function `deriveCodecFamilies(codecs): string[]`.

**F3. Server side.** Maintain per-session viewer state in `server/src/live/control/viewerStore.js`. Recompute recommendation on any viewer change:

```
minDownlink = min(viewer.downlinkMbit) * 0.7   // safety margin
codecs      = intersection(viewer.supportedCodecs)
maxRes      = max(viewport)
recommendedBitrate = clamp(minDownlink * 0.8, 500k, initialBitrate)
```

Push `recommended-settings` only when the recommendation differs by >10% or codec changes.

**F4. Streamer side: applying recommendations.** On `recommended-settings`:
1. Compute clamped settings: `final[k] = min(current[k], recommended[k])` for numeric fields.
2. If `final` differs meaningfully, respawn FFmpeg with `EXT-X-DISCONTINUITY` in the playlist. Track `next_segment_start_number` across the respawn.
3. Send `ack`.

**F5. UI.** A "Live status" panel visible only while streaming, showing viewer count, constraints, current parameters, initial ceiling, and a [Disable auto-adaptation] toggle.

**F6. The "lower-only" guarantee.** Enforced in `adapter.js` (`public/streaming/server-control/adapter.js`):

```js
export function applyRecommendation(current, recommendation, ceiling) {
  const clampDown = (cur, rec, ceil) => Math.min(cur, rec ?? cur, ceil);
  return { videoBitrate: clampDown(current.videoBitrate, recommendation.videoBitrate, ceiling.videoBitrate), ... };
}
```

Server applies the same clamp before sending. Belt and suspenders.

---

### Phase G — Telemetry and logging

**G1.** Per-session log dump on stop: settings used, viewer count over time, codec/bitrate changes, FFmpeg restarts, upload pass durations (from Plan 03).

**G2.** Optional opt-in "send anonymous diagnostics to Rebound" toggle.

**G3.** A `Stream health` mini-widget during streaming that surfaces FFmpeg's `speed=` value, last upload pass duration (from Plan 03's per-pass log), and dropped-frames count. Three colored states (good/warn/bad) with thresholds.

---

## Code organization & implementation notes

### Top-level layout

```
src/features/player/
  viewerProbe.js                            -- auto-detects viewer codecs + network (Phase F2)

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
  __tests__/

src/lib/streaming/                          -- shared business logic (renderer only)
  constraints/
    index.js
    videoCodec.js
    nvenc.js
    audio.js
    resolution.js
    bitrate.js
    initialCeiling.js
  detectProfile.js
  autoOptimize.js                           -- pure: (DetectedCapabilities) => StreamSettings
  validators.js

shared/streaming/                           -- types shared between renderer AND main
  types.js                                  -- move here from public/streaming/types.js
  protocol.js                               -- WebSocket message types + PROTOCOL_VERSION

public/streaming/                           -- main process (Electron)
  capabilities/
    probe.js                                -- top-level orchestrator
    ffmpegCheck.js
    gpuDetect/
      index.js                              -- dispatches by platform
      win32.js                              -- Get-CimInstance Win32_VideoController
      darwin.js                             -- system_profiler
      linux.js                              -- lspci
    audioDevices.js
    displays.js
  settings/                                 -- (Phase B)
    store.js
    schema.js
    migrate.js
    steps/
  capture/                                  -- (already in place)
    gfxcapture.js, gfxcaptureCuda.js, gdigrab.js, avfoundation.js, x11grab.js
    file.js                                 -- new: video file source mode (Phase D)
  encoder/                                  -- (already in place)
    nvenc.js, qsv.js, videotoolbox.js, software.js, amf.js, vaapi.js
    _vbv.js                                 -- (Plan 02, complete)
  audio/                                    -- new (Phase E)
    sources/
      microphone.js
      desktopLoopback.js
      processInclude.js
      processExclude.js
      fileAudio.js
    filterGraph.js
    levelMeter.js
  output/                                   -- (already in place)
    hls.js
  uploader/                                 -- (Plan 03, complete)
  server-control/                           -- new (Phase F)
    socket.js
    handlers/
      viewerSummary.js
      recommendedSettings.js
    adapter.js
    initialCeiling.js
  pipeline.js                               -- (already in place; extended in Phase D)
  process.js                                -- spawn/lifecycle/respawn-with-discontinuity
  manager.js                                -- replaces ElectronLiveStreamManager (≤300 lines)
  ipc.js                                    -- all live-stream:* IPC handlers

native-helpers/
  windows-process-loopback/
    src/                                    -- Rust or C++
    Cargo.toml | CMakeLists.txt
    README.md
```

### Cross-process boundaries

Exactly **three** boundaries:

1. **Renderer ↔ Main (IPC)** — all channels namespaced under `live-stream:*`, in `public/streaming/ipc.js`. Components never call `window.electronAPI` directly — only hooks do.
2. **Main ↔ Native helper (stdin/stdout)** — line-delimited JSON on stdin, raw PCM on stdout. Protocol documented in `native-helpers/windows-process-loopback/README.md` with a version constant; mismatched versions fail loudly.
3. **Streamer ↔ Server (WebSocket)** — message shapes in `shared/streaming/protocol.js` with `PROTOCOL_VERSION`. Both sides import from the same file.

### Architectural rules

**Renderer:**
- Hooks own IPC. Components import hooks only. `ipcRenderer` in a component is a bug.
- Reducers are pure. Persistence is a side effect in `useStreamSettings`'s `useEffect`, not the reducer.
- Constraints are pure. Each file in `src/lib/streaming/constraints/` exports `(settings, capabilities) => ConstraintResult[]`. Adding a constraint = new file + one-line registration.
- No business logic in JSX.

**Main process:**
- Pure argv builders in `capture/`, `encoder/`, `output/`, `audio/filterGraph.js`. They take config and return string arrays. No spawning, logging, or disk I/O.
- Side effects isolated: spawn in `process.js`, file I/O in `uploader/fileSource.js` and `settings/store.js`, network I/O in `uploader/httpClient.js` and `server-control/socket.js`.
- Manager is thin: ≤300 lines, orchestrates subsystems, does not build argv.
- ≤200 lines per file.

### Type discipline

Move `public/streaming/types.js` to `shared/streaming/types.js` as the first step of this plan, updating all relative imports in `public/streaming/`. Add `DetectedCapabilities`, `AudioSource`, `ConstraintResult`, `ViewerSummary`, `RecommendedSettings`, `StreamingProfile` (from Plan 01), `CodecProbeResult`, and `ViewerCapabilities` (Phase F2d) to the same file.

Configure `jsconfig.json` with `checkJs: true` so types are enforced on save.

### Testing strategy

- **Pure modules** (constraints, argv builders, planners, adapters) — unit tests, snapshot tests for argv.
- **Pure renderer state** (reducers, derived fields, formatters) — unit tests.
- **Hooks** — React Testing Library + fake IPC.
- **IPC handlers** — call directly with synthetic args.
- **Integration** — one harness per phase that wires real modules with fake I/O.
- **Native helper** — its own test suite in `native-helpers/windows-process-loopback/` plus CI smoke test on Windows runners.

## Migration & rollout

- Phase A and B ship together; they're invisible plumbing.
- Phase C ships behind a feature flag for one release so we can A/B against the existing UI. Default it on after one release of dogfooding.
- Phase D is small and ships with C or alone.
- Phase E ships alone. The native helper needs CI build infrastructure; budget the time for that.
- Phase F depends on the WebSocket/control protocol being well-specified before either side starts. Write the message shapes in `shared/streaming/protocol.js` first, then implement both sides.
- Phase G ships piecemeal alongside any other phase.

## Validation

- **Phase A/B:** persistence survives crash, app update, and OS restart. Probe runs in <500 ms on a warm disk.
- **Phase C:** every existing FFmpeg-error path that we've seen in support tickets is now blocked at the UI level (write a test fixture per known bad combo). The constraint engine test suite covers all invalid combos from Plans 01 and 02.
- **Phase D:** stream a local 1080p60 mp4 for 10 minutes; verify the produced HLS plays correctly and segment cadence matches `hls_time`.
- **Phase E:** capture mic + desktop + game-include in three concurrent sources; verify levels are correct, no double-audio, mute works in real time.
- **Phase F:**
  - `viewerProbe.js` unit test: mock `MediaSource.isTypeSupported`, `mediaCapabilities.decodingInfo`, and `navigator.connection`; assert `ViewerCapabilities` shape and `supportedCodecFamilies` derivation are correct across browsers that support none, some, or all of the three tiers.
  - Verify `viewer-capabilities` message is sent on WebSocket connect; open the player in a browser that does not support HEVC and confirm `supportedCodecFamilies` omits `"hevc"`.
  - Throttle the player's network via Chrome devtools (2 Mbit); wait for 10 HLS segments; confirm `hlsBandwidthEstimateMbit` in the message is within range of the throttle setting.
  - Stream at 8 Mbit; open the player on a throttled network at 2 Mbit; observe the streamer respawn at ≤2 Mbit within ~3–5 seconds.
  - Open a second viewer at 1 Mbit; observe a further drop.
  - Close both viewers; observe the streamer does NOT raise above the initial ceiling.
  - Manually set a value above the initial ceiling; UI rejects it.
- **Phase G:** verify the health widget shows accurate values during artificial stalls (drop the ffmpeg process or pull the network).
