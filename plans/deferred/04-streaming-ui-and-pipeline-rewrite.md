# Plan 04: Streaming UI rewrite, capability-aware settings, audio redesign, server-driven adaptation, mobile viewer experience, and Picture-in-Picture

> **Scope reminder:** _Streaming **from** a phone is explicitly **not** a planned feature._
> Mobile work in this plan is exclusively about **watching** streams on a phone (and, for the broadcaster, persistent feedback when navigating between desktop pages).

---

## Status snapshot (2026-05-04, late evening)

This section is the source of truth for "what's already in the repo vs. what this plan still owes." Keep it current as phases land.

> **Update 2026-05-05:** Both `captureFps` and the output `fps` now default to **60** (`public/streaming/defaults.js`, `src/routes/DesktopLivePage/DesktopLivePage.route.jsx`, `public/streaming/autoOptimize.js`). The streamer UI no longer exposes `Capture FPS` and `Output FPS` as separate fields — there is one **Frame rate (FPS)** input in the Output panel that writes both values in lock-step. The two-field shape is preserved end-to-end in the pipeline (`effectiveCaptureFps()`, `pipeline.buildArgs`, the gfxcapture filter graph) so that source-vs-encoder rate can still diverge in code paths that need it (e.g. `sourceMode === "file"`, future per-source overrides, `RECORDING_FPS_CEILING_RATIO` headroom). See Phase C item **C7** for the long-term constraint-engine treatment.

| Phase | Title                                           | Status                                | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ----- | ----------------------------------------------- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **0** | Code-quality refactor & file split              | **Not started**                       | Largest blockers: `DesktopLivePage.route.jsx` ~1024 lines, `public/electron-live-stream.js` ~775 lines, `LiveStreamPlayer.jsx` ~538 lines.                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| **A** | System capability probe                         | **Partial — monolithic**              | `public/streaming/capabilities/probe.js` (~161 lines) does FFmpeg `-hwaccels`/`-encoders`/`-filters`, Win32 GPU via PowerShell, and consumes `screen.getAllDisplays()`. **Missing:** the planned split (`ffmpegCheck.js`, `gpuDetect/{win32,darwin,linux}.js`, `audioDevices.js`, `displays.js`); the `useCapabilities` hook in the renderer; and the canonical `capabilities:get` IPC name (current names are `live-stream:get-capabilities` / `live-stream:get-detected-capabilities` / `live-stream:reprobe-capabilities`). `DetectedCapabilities` typedef exists in `shared/streaming/types.js`. |
| **B** | Settings persistence                            | **Mostly done**                       | `public/streaming/settings/{store.js,schema.js,migrate.js}` and `public/streaming/autoOptimize.js` exist; `settings:load` / `settings:save` / `settings:reset` IPC are wired. **Missing:** the `useStreamSettings` renderer hook (today the page debounces saves directly), and a "reset to auto-optimized" confirmation dialog.                                                                                                                                                                                                                                                                     |
| **C** | Settings UI rewrite + constraint engine         | **Not started**                       | The single 1024-line `DesktopLivePage.route.jsx` still exposes every raw FFmpeg knob with no constraint engine. `src/lib/streaming/constraints/`, `src/lib/streaming/detectProfile.js`, and the `ui/panels/` siblings of `LiveStatusPanel.jsx` do not exist.                                                                                                                                                                                                                                                                                                                                         |
| **D** | Video file streaming as a source mode           | **Backend done; UI exposure missing** | `public/streaming/capture/file.js` is implemented and wired through `capture/index.js`; `captureBackend === "file"` is documented in `public/streaming/types.js`. **Missing:** the renderer Source picker UI that lets a user pick a file, and the loop / play-once toggle.                                                                                                                                                                                                                                                                                                                          |
| **E** | Audio capture redesign                          | **Not started**                       | `public/streaming/audio.js` is just codec normalization (~18 lines). No `audio/` subtree, no filter graph, no mixer UI, no native loopback helper.                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| **F** | Server-driven adaptive control                  | **Substantially done**                | All protocol/types modules, `/live-control` Socket.IO namespace, viewer probe + reporting hook, streamer-side adapter / initial-ceiling / segment cursor / socket client, server-side viewer store + recommender + control session, and `EXT-X-DISCONTINUITY` respawn flow are in place. **Remaining:** viewer-facing surface (the hook return value is not yet consumed in `LiveStreamPlayer`), graceful UX when adaptation respawns, and integration tests across both processes.                                                                                                                  |
| **G** | Telemetry & logging                             | **Light — streamer-side only**        | `LiveStatusPanel.jsx` shows viewer count, recommendation history, and connection state. **Missing:** a viewer-side health widget, stop-time per-session log dump, and the optional opt-in diagnostics toggle.                                                                                                                                                                                                                                                                                                                                                                                        |
| **H** | Mobile viewer experience                        | **Not started**                       | `LiveStreamPlayer.jsx` only branches on `theme.breakpoints.down("sm")` for `alwaysShowControls`; it has no orientation-aware layout, no touch gesture model, no native-HLS path for iOS Safari, and no chrome to tuck the seek bar / metadata cleanly into a phone viewport.                                                                                                                                                                                                                                                                                                                         |
| **I** | Picture-in-Picture & ambient streaming presence | **Not started**                       | No PiP code exists in the repo. `LiveStreamPlayer` is mounted per-route, so navigating away tears the player down; broadcasters get no app-bar indicator that they are still streaming.                                                                                                                                                                                                                                                                                                                                                                                                              |
| **J** | Theme & MUI presentation polish                 | **Not started**                       | `src/helpers/darkTheme.js` defines a base dark theme with two component overrides (`MuiInputBase`, `MuiDrawer`). No streaming-specific tokens, no card/chip flair, no surface palette for "live" indicators, no consistent typography scale for streaming chrome.                                                                                                                                                                                                                                                                                                                                    |

> **Three new phases (0, H, I, J)** were added to this plan on 2026-05-04 (late evening). They reflect the user's directives: (1) prioritize splitting up large files and lifting code quality across all phases; (2) make watching enjoyable on phones (without supporting _streaming_ from phones); (3) keep the player visible (PiP) when the viewer navigates away and keep the broadcast visible to the streamer when they do the same; (4) lean into MUI's custom-theming API for tasteful flair while staying inside MUI conventions.

---

## Updated execution priorities

The order below is the _recommended_ sequence; items at the same depth can ship in parallel when staffing allows.

1. **Phase 0** — split the three monoliths (`DesktopLivePage`, `electron-live-stream.js`, `LiveStreamPlayer`) before adding new surface area. Every subsequent phase compounds the cost of leaving them alone.
2. **Phase A polish** — split `capabilities/probe.js` into the planned subtree, add `useCapabilities`, and standardize IPC names. Cheap; unblocks Phase C constraints.
3. **Phase B finish** — add `useStreamSettings`, the reset-to-auto-optimized dialog, and migrate `DesktopLivePage` to consume the hook (becomes a clean substrate for Phase C).
4. **Phase D UI exposure** — Source-picker radio + file picker. The backend is done; this is days of UI work.
5. **Phase C** — settings UI rewrite with constraint engine. Lands behind a feature flag until parity with current page is proven.
6. **Phase H** — mobile viewer experience. Touches `LiveStreamPlayer` extensively; coordinate with Phase 0's split of that file.
7. **Phase I** — Picture-in-Picture + ambient streaming presence. Depends on a Redux slice introduced in Phase 0 (`liveSessionSlice`) so player and broadcaster state survives route changes.
8. **Phase F polish** — surface viewer-side adaptation telemetry inside the new mobile-first player chrome; add the integration test suite.
9. **Phase J** — theme & presentation polish. Best done as a sweep after Phases C/H/I land so we're styling the final component set, not a moving target.
10. **Phase E** — audio redesign. Largest standalone effort; gated behind a feature flag and the Windows native helper's CI build infra.
11. **Phase G** — telemetry & logging. Ships piecemeal alongside other phases; the viewer-side health widget piggybacks on Phase H.

---

## Status of prerequisites

- **Plan 01** (NVENC defaults + quality profile system): **complete.** The `public/streaming/profiles/` system and `defaults.js` are inputs to Phase C's auto-optimize and constraint engine.
- **Plan 02** (VBV bufsize): **complete.** `vbvMultiplier` exists in `StreamConfig` and `defaults.js`.
- **Plan 03** (parallel uploads): **complete.** `public/streaming/uploader/` is extracted and self-contained.

The streaming pipeline module split (`public/streaming/capture/`, `encoder/`, `output/hls.js`, `filters/videoFilter.js`, `pipeline.js`, `platform/profiles.js`, `presets.js`, `types.js`, `defaults.js`) is already in place.

---

## Problem

The current streaming experience has **two different shapes** of pain:

### Broadcaster pain

A single tall page (`src/routes/DesktopLivePage/DesktopLivePage.route.jsx`, ~1024 lines) exposes raw FFmpeg-adjacent controls (codec, preset, B-frames, lookahead, multipass, NVENC tune, AQ knobs, etc.) without:

1. **Knowledge of what the user's system can actually do.** The UI lets a user pick `hevc_nvenc` on a laptop without an NVIDIA GPU, or `videotoolbox` on Windows, or pick combinations like `tune=ull + multipass=fullres + lookahead=16` that quietly contradict each other. Validation is a flat list of `throw new Error(...)` calls in `normalizeConfig`; the UI itself has no concept of constraints.
2. **No "just make it work" path.** A new user is presented with ~30 settings, all defaulted to whatever was hardcoded years ago.
3. **No video file streaming surface.** The pipeline now supports `captureBackend === 'file'` end-to-end, but there is no UI to point it at a local `.mp4`.
4. **Audio is an afterthought.** A single text field for `audioInputArgs` accepts arbitrary FFmpeg input arguments. Users cannot mix mic + desktop + per-app audio without writing FFmpeg flags by hand.
5. **No persistent presence.** The moment the broadcaster navigates to `/chat` or `/servers`, every live-stream IPC subscription on `DesktopLivePage` unmounts and they lose all visibility into the stream they're still pushing out.

### Viewer pain

The viewer side has its own set of pain points that are _not_ solved by anything that exists today:

6. **`LiveStreamPlayer.jsx` is desktop-shaped.** It uses one breakpoint (`theme.breakpoints.down("sm")`) to pin its controls visible, but the layout, hit targets, gesture model, error states, and chrome all assume a wide cursor-driven viewport. iOS Safari's native HLS path is not even attempted; HLS.js is unconditional.
7. **No Picture-in-Picture.** When the viewer leaves `/live` to look at a friend's profile, the stream is gone. There is no `requestPictureInPicture()` integration and no Document-PiP fallback, so the player is route-locked.
8. **Adaptation telemetry is not surfaced to viewers.** `useLiveControlClient` exposes `viewerSummary`, `recommendation`, and `ack`, but `LiveStreamPlayer` does not destructure them. Viewers get no indication when the stream just dropped quality on their behalf.
9. **The visual language is unfinished.** `darkTheme.js` defines two component overrides total. The streaming surfaces inherit MUI's defaults wholesale, so viewer chrome and broadcaster chrome look like a generic admin panel rather than a product.

### System pain

10. **Three monolithic files own most of the streaming product.** Any change to `DesktopLivePage.route.jsx` (1024 lines), `public/electron-live-stream.js` (775 lines), or `LiveStreamPlayer.jsx` (538 lines) ships with high risk and slow review. The plan's `≤200 lines per file` and `manager ≤300 lines` rules are aspirational, not enforced.
11. **State for an in-flight stream lives on the page that started it.** Both broadcaster and viewer state is owned by route components, so neither survives navigation. This is the root cause of #5 and #7.

---

## Why this should be fixed

- New users get scared by the current settings page and either pick blindly or churn.
- "Settings combos that crash FFmpeg" is a constant support pattern.
- File-source streaming is a high-value, low-effort feature that broadens the product — the backend is already done, only UI is missing.
- Per-app audio control is a genuine differentiator.
- Server-driven adaptation is the only architecturally correct way to handle a viewer base with mixed devices.
- Mobile is the dominant viewing surface for live content; not catering for it leaves engagement on the table.
- Without PiP and broadcaster presence, viewers and streamers are forced into a single-page-app ghetto inside a multi-page-app shell.
- Three monolithic files are a tax on every future change in this product area.

---

## Expected result

- A settings UI organized into a **simple "Auto-optimized" path** (default) and an **advanced manual path** (collapsed by default).
- The UI **cannot let the user pick an invalid combo.** Disabled-by-constraint options are visibly disabled with a tooltip explaining why.
- Settings persist across app restarts via a single `useStreamSettings` hook. A "Reset to defaults" button is one click away and shows a confirmation dialog.
- A **Source picker** with three modes: **Screen / Window / Video file**.
- An **Audio mixer** UI showing every detected audio source with per-source mute, level, and an "exclude this app" toggle.
- A **Live status panel** during streaming showing viewer count, current parameters, what changed since stream start, and why.
- The streamer's actual stream parameters can be **lowered automatically** in response to viewer constraints. They never exceed what the user originally selected.
- **Watching on a phone is enjoyable.** The player adapts to portrait / landscape, uses touch-friendly controls, falls back to native HLS on iOS Safari, and surfaces adaptation events ("dropped to 720p because your network slowed") in plain language.
- **Picture-in-Picture works** on every platform that supports it: standard PiP via `HTMLVideoElement.requestPictureInPicture()`, Document-PiP fallback (Chromium 116+ / Electron) for arbitrary chrome, and a tasteful "minimized player" portal for browsers that support neither.
- **Broadcasters always know they are streaming.** A persistent app-bar pill ("● Live — 23 viewers — 4.2 Mbit/s") is visible on every page while a stream is active and is clickable to return to the broadcast page.
- **Files stay small.** The three monolith files are split into focused modules averaging ≤200 lines, with the live-stream manager kept ≤300 lines.
- **Visual polish without breaking MUI.** Custom theming (extra palette tokens, component variants, typography role for "stream metadata") lives in `darkTheme.js` and per-feature `sx` props use theme tokens, never raw hex.

---

## How to fix

This is a multi-phase project. Phases are ordered so each one ships value on its own and unblocks the next.

---

### Phase 0 — Code-quality refactor & file split

This phase has **higher priority than every other phase** because every other phase compounds the cost of not doing it.

**0.1. Split `DesktopLivePage.route.jsx` (~1024 lines).** Target shape:

```
src/routes/DesktopLivePage/
  DesktopLivePage.route.jsx          -- ≤120 lines: Redux wiring + Suspense + composition
  sections/
    SourceSection.jsx                -- screen / window / file picker (Phase D + C)
    OutputSection.jsx                -- resolution / fps / bitrate / codec
    AdvancedSection.jsx              -- collapsed expert controls
    AudioSection.jsx                 -- placeholder until Phase E lands
    LiveStatusSection.jsx            -- thin wrapper around LiveStatusPanel
  hooks/
    useDesktopBroadcastState.js      -- composes electron-live IPC subscriptions
    useStreamLifecycle.js            -- start/stop, status transitions
  copy/
    fallbackCatalogs.js              -- the giant FALLBACK_* arrays at the top of the file today
```

The `FALLBACK_VIDEO_CODEC_OPTIONS`, `NVENC_PROFILE_OPTIONS`, `NVENC_PROFILE_DEFAULTS`, etc. constants from the top of the current file move verbatim into `copy/fallbackCatalogs.js`.

**0.2. Split `public/electron-live-stream.js` (~775 lines).** Target shape:

```
public/streaming/
  manager/
    ElectronLiveStreamManager.js     -- ≤300 lines: lifecycle orchestration
    adaptationLoop.js                -- handleRecommendation + applyRecommendation glue
    serverControlBridge.js           -- _wireServerControlEvents extracted
    respawn.js                       -- discontinuity respawn helper
  ipc/
    register.js                      -- registerLiveStreamIpc, single entrypoint
    handlers/
      session.js                     -- start/stop/state
      capabilities.js                -- get-capabilities / get-detected-capabilities / reprobe
      settings.js                    -- load / save / reset
      adaptation.js                  -- set-auto-adapt
```

Today `public/electron-live-stream.js` mixes manager, bridge, IPC registration, and ad-hoc helpers. The `manager/` and `ipc/` subdirectories are non-negotiable for this refactor.

**0.3. Split `src/components/Live/LiveStreamPlayer.jsx` (~538 lines).** Target shape:

```
src/features/player/
  LiveStreamPlayer.jsx               -- ≤180 lines: composition + refs
  hooks/
    useHlsPlayback.js                -- hls.js attach/detach, FRAG_LOADED, LEVEL_SWITCHED
    useLatencySync.js                -- buildSyncTuning + syncToLive interval
    usePlayerState.js                -- isPlaying / isMuted / volume reducer
    useFullscreen.js                 -- requestFullscreen + exit handlers
    useNativeHls.js                  -- iOS Safari native HLS branch (Phase H)
  controls/
    PlayPauseButton.jsx
    VolumeControl.jsx
    LiveSyncButton.jsx
    FullscreenButton.jsx
    PictureInPictureButton.jsx       -- (Phase I)
    StreamMetaPill.jsx               -- viewer count, codec, latency
  overlays/
    LoadingOverlay.jsx
    ErrorOverlay.jsx
    BufferingIndicator.jsx
    AdaptationToast.jsx              -- "dropped to 720p" notice (Phase F polish)
```

`LiveStreamPlayer.jsx` becomes the _composition_ surface; everything else is a hook or presentational component.

**0.4. Introduce `liveSessionSlice` in Redux.** Currently broadcaster state (running/idle, current settings, viewer count, recommendation history, auto-adapt toggle) lives entirely in `DesktopLivePage` local React state. Move the **observable** parts (running flag, current sessionId, viewer count, current `videoBitrate` / `outputWidth` / `outputHeight`, codec, `autoAdaptEnabled`, last recommendation reason) into a Redux slice keyed by role:

```js
// src/slices/liveSessionSlice.js
{
  broadcaster: {
    status: "idle" | "starting" | "live" | "stopping" | "error",
    sessionId: string | null,
    startedAt: number | null,
    settings: { videoBitrate, outputWidth, outputHeight, fps, videoCodec },
    initialCeiling: { ... } | null,
    viewerSummary: ViewerSummary | null,
    autoAdaptEnabled: boolean,
    lastRecommendation: { reason, appliedAt, settings } | null,
    error: string | null,
  },
  viewer: {
    activeStream: { sessionId, publicToken, label } | null,
    pip: { mode: "off" | "native" | "document" | "portal", since: number | null },
    minimized: boolean,
  }
}
```

This slice is the substrate for Phase I (PiP & broadcaster presence) and is the single subscription point for the persistent app-bar pill.

**0.5. Lint / file-size CI gate.** Add a check that fails CI when any file in `public/streaming/`, `src/features/streaming/`, `src/features/player/`, `src/lib/streaming/`, or `server/src/live/` exceeds 300 lines, with an explicit allow-list (manager files at 300, route shells at 200). The thresholds match the architectural rules in the _Code organization_ section of this plan; tighten the thresholds case-by-case rather than carrying exemptions long term.

**0.6. Tests stay green.** This phase changes structure, not behavior. The 113 streaming + 53 server tests must continue to pass; add a smoke test per split file proving its public exports resolve.

---

### Phase A — System capability probe (foundation for everything else)

**Status: partial — monolithic.** The probe runs and produces a `DetectedCapabilities`-shaped object today, but the planned subtree split, the `useCapabilities` hook, and the canonical IPC name do not exist.

Note: this probe is also the foundation for Plan 05 Phase H (GPU profiling). The two plans share the same probe output.

**A1. Split the existing `public/streaming/capabilities/probe.js`** into the planned subtree:

```
public/streaming/capabilities/
  probe.js              -- top-level orchestrator: composes the helpers, owns the cache
  ffmpegCheck.js        -- parses `-hwaccels`, `-encoders`, `-filters`
  gpuDetect/
    index.js            -- dispatches by platform
    win32.js            -- Get-CimInstance Win32_VideoController (lifted from probe.js today)
    darwin.js           -- system_profiler SPDisplaysDataType
    linux.js            -- lspci / glxinfo
  audioDevices.js       -- DirectShow / AVFoundation / PulseAudio enumeration
  displays.js           -- consumes screen.getAllDisplays() + Win32 EDID query when available
```

**A2. Audit `DetectedCapabilities`.** The typedef already lives in `shared/streaming/types.js`. Verify every field a constraint or auto-optimizer needs is present, including `audioDevices: Array<{ id, kind, label, isDefault }>` and `displays: Array<{ id, bounds, scaleFactor, refreshRateHz, isPrimary }>`.

**A3. Standardize IPC.** Today there are three names: `live-stream:get-capabilities` (platform profile catalog), `live-stream:get-detected-capabilities` (probe snapshot), and `live-stream:reprobe-capabilities`. Add the canonical aliases `capabilities:get` and `capabilities:reprobe` (keep the existing names for one release with a deprecation log line) so the rest of this plan can write against the simpler name.

**A4. Add `useCapabilities()` hook.** Wraps the IPC, caches the snapshot in module scope (the probe is expensive), and re-resolves on `capabilities:reprobe`. Returns `{ capabilities, refresh, isProbing, error }`.

**A5. The probe writes its result to `app.getPath('userData')/capabilities.json`** so the renderer can read it synchronously on UI mount and the file can be inspected for support purposes.

---

### Phase B — Settings persistence and "Clear saved settings"

**Status: mostly done.** `store.js`, `schema.js`, `migrate.js`, `autoOptimize.js`, and `settings:load` / `settings:save` / `settings:reset` IPC are all in place.

**Remaining work:**

**B1. `useStreamSettings()` hook.** Returns `[settings, updateSettings, resetSettings]`. `updateSettings` debounces saves to once per second to avoid disk thrash. `resetSettings()` writes the auto-optimized defaults and shows a `<Dialog>` confirming the destructive action. Today's `DesktopLivePage` open-codes this; the hook centralizes it.

**B2. Two-tier defaults.** Verify "Defaults" means the auto-optimized values for _this machine_, not a hardcoded constant. So `Reset` doesn't drop a Windows + RTX user back into a generic config — it re-runs the optimizer using the latest `DetectedCapabilities`.

**B3. Confirmation copy.** Reset dialog must list, in plain language, what's about to change. ("This will switch to the default profile for your NVIDIA RTX 4070, set bitrate to 8 Mbit/s, …")

**File layout:**

```
public/streaming/settings/    -- already in place
  store.js
  schema.js
  migrate.js
  steps/
    v0_to_v1.js               -- (if needed in future)
src/features/streaming/hooks/
  useStreamSettings.js        -- new
```

---

### Phase C — Settings UI rewrite with constraint engine and auto-optimize

**Status: not started.** This phase replaces the body of `DesktopLivePage.route.jsx` (after Phase 0 has split it into sections) and the streaming-related sections of `SettingsPage.route.jsx`.

**C1. Page layout.**

```
┌─ Source ───────────────────────────────────────┐
│ ( ) Screen   ( ) Window   ( ) Video file       │
│ [thumbnail picker / file input]                 │
├─ Audio mixer ──────────────────────────────────┤
│ [Phase E content]                               │
├─ Output ───────────────────────────────────────┤
│ [Auto-optimize]  [Custom ▾]                     │
│  → Resolution, Frame rate (single), bitrate,    │
│    codec, latency                               │
├─ Advanced (collapsed) ─────────────────────────┤
│  → preset, lookahead, B-frames, AQ, VBV, ...    │
├─ Live status (only visible while streaming) ───┤
│ [LiveStatusPanel]                               │
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

**C3. Auto-optimize function.** `public/streaming/autoOptimize.js` already exists — consume it from the renderer (move it to `src/lib/streaming/autoOptimize.js` if it pulls in renderer-only deps, otherwise wrap it via IPC). It uses the quality profile system from Plan 01 to apply the appropriate profile per the algorithm in the original plan body.

**C4. Profile selector and `detectProfile`.** `detectProfile.js` lives in `src/lib/streaming/`. After every settings change in `useStreamSettings`, run `detectProfile(settings)` — walks the quality profile list from Plan 02, returns the first complete match or `"custom"`. Used to display the active profile name in the selector and to know whether to offer "Apply Low Latency" affordances.

`ProfileSelector.jsx` in `src/features/streaming/ui/controls/` is the presentational component. Takes `value` + `onChange` + `profiles` list.

**C5. Field-by-field tooltips.** Every advanced field has a one-sentence explanation. Latency-sensitive fields marked with a clock icon. The wording matters: never use "FFmpeg" or codec letters in the user-facing copy; if the explanation requires that, hide it behind a "Why?" link.

**C6. Feature flag.** Ships behind `settings.featureFlags.newStreamingPage` for one release while the old page remains the default. Default-on after one release of dogfooding.

**C7. Frame rate as a single user-facing control.** The user only sees one numeric **Frame rate (FPS)** input in the Output panel. It writes both `settings.fps` _and_ `settings.captureFps` to the same value, and the constraint engine derives the dependent `gopSize` (`fps × hlsTime`) at write time so the two-field GOP rule from C2 is honored automatically. The two-field shape is **preserved in the backend** because:

- `public/streaming/numbers.js#effectiveCaptureFps()` still caps the source's emission rate at `ceil(fps × RECORDING_FPS_CEILING_RATIO)` so a misconfigured `captureFps` (e.g. one persisted from a much older settings file) cannot push the encoder past the configured target rate.
- `public/streaming/filters/videoFilter.js` only inserts the `fps=<n>` filter when `config.fps` is set, and `pipeline.js` writes `-fps_mode cfr -r <fps || captureFps>` so the source-vs-encoder rate distinction is still meaningful in pipeline tests (`pipeline.test.js` exercises both equal-rate and `captureFps !== fps` paths).
- `sourceMode === "file"` overrides this: file capture inherits its rate from the file itself, so the constraint engine disables the FPS field when the user picks a video file source (matching the Phase D "disable irrelevant settings in file mode" rule).
- Future audio/video per-source overrides (e.g. capturing a 30 fps webcam alongside a 60 fps screen) keep the door open to surface a separate "source rate" advanced control without reshaping the pipeline.

The default value is **60** for both fields. `autoOptimize` clamps the value to `min(displayFrequency, 60)` and writes the same number to `fps` and `captureFps` so an auto-optimized profile never produces an asymmetric pair.

---

### Phase D — Video file streaming as a source mode

**Status: backend done, UI exposure missing.** `public/streaming/capture/file.js` is implemented and `captureBackend === "file"` is wired through `capture/index.js`.

**Remaining work:**

**D1. Source picker.** Add the third radio (`Video file`) to the source picker in `SourceSection.jsx` (Phase 0). Selecting it shows a file picker with filters for `.mp4`, `.mkv`, `.mov`, `.webm`, `.ts`. The picker uses Electron's `dialog.showOpenDialog` via IPC; the renderer never touches the filesystem directly.

**D2. Probe the file with `ffprobe`** before accepting it. Validate it has a video stream; capture native width/height/fps/codec/audio. Display a small preview card with this metadata so the user knows what they're about to broadcast.

**D3. Loop / play once.** A toggle. Default: loop forever (this matches the most common "rebroadcast a clip" use case).

**D4. Disable irrelevant settings in file mode.** No frame-rate input (the file's native rate wins — see C7), no draw mouse, no monitor index. The constraint engine handles this automatically (file mode forces those fields disabled).

**D5. Plan-validated test.** Stream a local 1080p60 mp4 for 10 minutes; verify the produced HLS plays correctly and segment cadence matches `hls_time`.

---

### Phase E — Audio capture redesign

**Status: not started.**

**E1. Define the audio model.** `AudioSource` typedef already lives in `shared/streaming/types.js`:

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

**E2. Native helper for per-process loopback (Windows-specific).** Windows 10 build 19041+ exposes process-loopback via `IAudioClient` activation parameters. FFmpeg does not wrap this. Ship a small native exe (Rust or C++) that reads PCM from a process-loopback session and writes raw PCM to stdout. FFmpeg ingests it via `-f s16le -ar 48000 -ac 2 -i pipe:0`. The exe is invoked once per `process_include`/`process_exclude` source.

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

**Status: substantially done.**

**Done:** `shared/streaming/protocol.js` (162 lines, `PROTOCOL_VERSION = 1`), `shared/streaming/types.js` (185 lines), `src/features/player/viewerProbe.js` (308 lines), `src/features/player/useLiveControlClient.js` (196 lines), `src/features/streaming/ui/panels/LiveStatusPanel.jsx` (273 lines), `server/src/live/control/{viewerStore.js (168), recommender.js (221), controlSession.js (196), socket.js (255)}`, `public/streaming/server-control/{adapter.js (115), initialCeiling.js (31), segmentCursor.js (88), socket.js (193)}`. The `EXT-X-DISCONTINUITY` respawn flow lives in `output/hls.js` and the `pipeline.buildArgs` chain. `ElectronLiveStreamManager` records the initial ceiling, listens to `viewer-summary` / `recommended-settings`, runs `applyRecommendation`, optionally respawns FFmpeg, and acks with the actual settings + `clampedBy` (`user-initial-ceiling | user-disabled | respawn-failed | no-change`). Auto-adapt toggle is a real IPC handler (`live-stream:set-auto-adapt`). 28 tests across `public/streaming/__tests__/server-control/` and `server/test/live/control/` pass.

**Remaining work:**

**F-α. Surface viewer-side adaptation telemetry.** `useLiveControlClient` returns `{ viewerSummary, recommendation, ack, connected }` but `LiveStreamPlayer` does not destructure them. Add an `AdaptationToast` overlay (lives in `src/features/player/overlays/`) that shows brief, plain-English messages on `LEVEL_SWITCHED` events: _"Quality dropped to 720p — your network slowed."_ / _"Quality restored to 1080p."_ The toast follows the surface palette defined in Phase J.

**F-β. Respawn UX.** When the server-driven respawn happens, the viewer may see a 1-3 second buffering blip. Today this is uncovered. Wire the `BufferingIndicator` overlay to the `LEVEL_SWITCHED` + buffer-empty event combination so the user sees a friendly _"Reconnecting…"_ instead of a frozen frame.

**F-γ. Streamer-side panel polish.** `LiveStatusPanel.jsx` already shows recommendation history; add a compact mobile-equivalent (Phase H) for a future "phone broadcaster" use case (scope: read-only, since broadcasting _from_ a phone is out of scope for this plan).

**F-δ. Integration tests.** End-to-end harness that spins up a real `/live-control` namespace, an in-memory viewer probe, and a fake `ElectronLiveStreamManager` to exercise: (1) initial connect, (2) viewer joins, (3) viewer's `hlsBandwidthEstimateMbit` drops, (4) recommendation pushed, (5) respawn ACK. Today the unit tests cover the modules in isolation.

**F-ε. Document the protocol.** Add `shared/streaming/PROTOCOL.md` with the message catalog, the throttling rules (every 10 segments / >15% change / `LEVEL_SWITCHED` immediate), and the **ceiling-bounded** adaptation guarantee. Both renderers and the server import from `protocol.js`; the markdown is the human-readable spec.

The ceiling-bounded guarantee is enforced in `public/streaming/server-control/adapter.js`:

```js
export function applyRecommendation(current, recommendation, ceiling) {
  const clamp = (rec, ceil) => Math.min(rec ?? ceil, ceil);
  return { videoBitrate: clamp(recommendation.videoBitrate, ceiling.videoBitrate), ... };
}
```

The streamer adapts **bidirectionally within the ceiling**: it lowers immediately when the recommender says so (protect viewers from buffering) and raises back up when conditions improve, never above what the user originally selected. The raise side is gated on the server by a dwell window (`RAISE_DWELL_MS` in `server/src/live/control/controlSession.js`) so a transient viewer disconnect cannot cause an FFmpeg respawn flap. Server applies the same `min(rec, ceiling)` clamp in `recommender.js` before sending. Belt and suspenders.

---

### Phase G — Telemetry and logging

**Status: light — streamer-side only.** `LiveStatusPanel` covers most of the streamer-side observability.

**Remaining work:**

**G1.** Per-session log dump on stop: settings used, viewer count over time, codec/bitrate changes, FFmpeg restarts, upload pass durations (from Plan 03). Written to `app.getPath('userData')/sessions/<sessionId>.json`.

**G2.** Optional opt-in "send anonymous diagnostics to Rebound" toggle. Lives in the Settings page, not the stream page.

**G3.** A `Stream health` mini-widget during streaming that surfaces FFmpeg's `speed=` value, last upload pass duration (from Plan 03's per-pass log), and dropped-frames count. Three colored states (good/warn/bad) with thresholds.

**G4. Viewer-side health widget.** A discrete chip in the player chrome (Phase H mobile layout aware) showing current latency to live edge, current HLS level, and the most recent adaptation event. Tappable to expand; collapsed by default.

---

### Phase H — Mobile viewer experience

**Status: not started.** \*Streaming **from** a phone is **explicitly out of scope.\*** This phase is **only** about viewing.

**H1. Layout strategy.**
`LiveStreamPlayer` switches between three layouts:

| Form factor      | Trigger                                                                   | Behavior                                                                                                                                                       |
| ---------------- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Desktop          | `theme.breakpoints.up("md")`                                              | Today's layout: hover-hidden chrome, mouse-driven seek/volume sliders, side-by-side metadata.                                                                  |
| Mobile portrait  | `theme.breakpoints.down("md")` + `window.innerHeight > window.innerWidth` | 16:9 video pinned to top, metadata + adaptation toast stacked beneath, controls always visible, double-tap-to-seek-10s gesture, single-tap-to-toggle-controls. |
| Mobile landscape | `theme.breakpoints.down("md")` + `window.innerWidth ≥ window.innerHeight` | Full-bleed immersive: video fills viewport, controls overlay with auto-hide, status bar hidden via `screen.orientation` lock prompt.                           |

Use a `usePlayerLayout()` hook (lives in `src/features/player/hooks/`) that consumes `useMediaQuery` and `window.matchMedia('(orientation: portrait)')`.

**H2. Native HLS branch for iOS Safari.** HLS.js is not supported on iOS Safari — it relies on the native HLS path (`<video src="...">`). Add `useNativeHls()` (Phase 0 split) that detects `Hls.isSupported() === false && video.canPlayType('application/vnd.apple.mpegurl')` and uses native playback, while still wiring up `useLiveControlClient` (the viewer probe still works without HLS.js, it just loses the `hlsBandwidthEstimateMbit` field — protocol already documents this as `null` when unavailable).

**H3. Touch gesture model.**

- Single tap: toggle chrome visibility.
- Double tap left half: seek -10s. Double tap right half: seek +10s.
- Long press on the video area: surface a quick action sheet (Picture-in-Picture, Share link, Copy stream URL, Report).
- Vertical drag on the right half: volume. Vertical drag on the left half: brightness _(only visible while playing)_.
- Pinch-out: enter fullscreen.

All gestures land via a `useTouchGestures()` hook so they can be tested in isolation.

**H4. Touch-friendly hit targets.** Minimum 44×44 dp per Apple HIG / 48×48 dp per Material. Today's `IconButton` defaults to 40dp — bump to `size="large"` (48dp) on mobile via `theme.components.MuiIconButton.variants` (Phase J registers the variant).

**H5. Chrome composition.**

- Top: thin gradient with stream title, host avatar, viewer count chip, close-X (returns to `/live`).
- Bottom: large play/pause, scrub bar (seek to live edge button when behind), volume sheet (tap → modal slider), more menu (PiP / share / quality / report).
- Side: nothing (preserve immersive feel).

**H6. Content-aware text scaling.** The `<Typography variant="streamMeta">` token (Phase J) sizes itself relative to viewport on mobile so labels remain legible in landscape.

**H7. Network savings.** `navigator.connection.saveData === true` ⇒ default to lowest available HLS level on initial play; show a "Data saver on — quality limited" chip the user can dismiss/override.

**H8. Wake lock.** Acquire `navigator.wakeLock?.request('screen')` while playing on mobile so the screen does not auto-dim mid-stream. Release on pause / page hide. Treat absence of the API as a no-op.

**H9. Validation matrix.**

| Device    | Browser          | Required outcome                                                                         |
| --------- | ---------------- | ---------------------------------------------------------------------------------------- |
| iPhone 13 | Safari (latest)  | Native HLS plays; controls usable; landscape immersive; PiP works (system-level on iOS). |
| iPhone 13 | Chrome iOS       | Same as Safari (Chrome iOS is a Safari shell).                                           |
| Pixel 7   | Chrome (latest)  | HLS.js plays; gestures work; PiP works (native + Document-PiP).                          |
| Pixel 7   | Firefox (latest) | HLS.js plays; gestures work; standard PiP works.                                         |
| iPad      | Safari           | Treated as desktop layout (`md` breakpoint).                                             |

---

### Phase I — Picture-in-Picture & ambient streaming presence

**Status: not started.** No PiP code exists in the repo.

**Goal:** the viewer keeps watching while navigating; the broadcaster keeps seeing they're live while navigating.

**I1. PiP strategy ladder (viewer side).**

```
1. requestPictureInPicture()           -- HTMLVideoElement Picture-in-Picture API
                                          (Chrome desktop, Edge, Safari, Chrome Android)
2. documentPictureInPicture            -- Document Picture-in-Picture API (Chromium 116+,
                                          Electron). Lets us render arbitrary chrome
                                          in the floating window — adaptation toast,
                                          viewer count, controls — not just the video.
3. Portal fallback                     -- a small floating <Card> rendered into a
                                          React Portal at the document root. Draggable.
                                          Used when neither API is available
                                          (older browsers).
```

The `usePictureInPicture()` hook owns the strategy ladder and exposes `{ mode, enter, exit, supports }`. State persists in `liveSessionSlice.viewer.pip`.

**I2. PiP trigger flow.**

- Manual: PiP button in player chrome (`controls/PictureInPictureButton.jsx`).
- Automatic on navigate-away: when `liveSessionSlice.viewer.activeStream` is set and the route changes off `/live/*`, dispatch `enter()` if `mode !== 'off'` and the user has opted in (settings flag, default off for first release; tunable to default on once we trust the UX).
- Exit: closes the PiP window; navigating back to `/live/<sessionId>` restores in-page playback automatically.

**I3. Document-PiP layout.** When using Document-PiP, render the floating window with:

```
┌───────────────────────────┐
│ <video> (16:9 letterboxed)│
├───────────────────────────┤
│ [Stream title]   [● 23]   │
│ [⏯] [🔊] [↗ open]        │
└───────────────────────────┘
```

The `[↗ open]` button calls `window.opener.location.assign("/live/<sessionId>")` and closes the PiP window — the user is back to the full player without losing playback continuity.

**I4. Ambient streaming presence (broadcaster side).**

A persistent pill in the app bar, rendered by `<LiveBroadcastBadge />` mounted inside `CustomAppBar`. Subscribes to `liveSessionSlice.broadcaster`. Visible whenever `broadcaster.status === "live"` regardless of the current route. Shape:

```
┌─────────────────────────────────────────────────┐
│ ● Live  •  23 viewers  •  4.2 Mbit/s  •  42:11 │
└─────────────────────────────────────────────────┘
```

Tooltip on hover explains the elements. Click ⇒ `navigate("/live/broadcast")`. Long-press / right-click ⇒ context menu with "Stop stream" and "Open live status".

**I5. Ambient viewer presence.** Mirror surface for viewers — a smaller pill `< Watching: <stream title>>` that appears in the app bar when `liveSessionSlice.viewer.activeStream` is set and PiP is in `off` mode (i.e. the viewer is on a non-`/live` route but PiP couldn't be entered). Click to return to the player route; the player remounts to the same `sessionId` and seeks to live.

**I6. State ownership.** All "is the user broadcasting / watching right now?" state lives in `liveSessionSlice` (Phase 0). The badge components are pure subscribers. This is the single source of truth — never let a route component own this state again.

**I7. Validation.**

- Start a broadcast on `/live/broadcast`, navigate to `/chat`, verify badge appears, click badge, return to broadcast page, badge stays consistent.
- Start watching on `/live/streams`, click a stream, navigate to `/profile`, verify PiP enters automatically (once opt-in is on) or the viewer pill appears in fallback mode.
- Test the four PiP tiers across the validation matrix (Phase H9).

---

### Phase J — Theme & MUI presentation polish

**Status: not started.** `darkTheme.js` defines two component overrides; everything else is MUI default.

**J1. Extend the palette with streaming-specific tokens.** Edit `src/helpers/darkTheme.js`:

```js
palette: {
  // ...existing tokens...
  live: {
    main: "#ff3b30",         // pulsing live indicator dot
    dim:  alpha("#ff3b30", 0.4),
    glow: "0 0 12px rgba(255,59,48,0.45)",
  },
  stream: {
    surface:     "#1f1f1f",  // player chrome background
    surfaceHi:   "#2a2a2a",  // PiP / floating cards
    overlay:     alpha("#000", 0.55),
    metaText:    "#bcbcbc",
    accent:      "#21f3dc",  // existing info color, re-exported under stream
  },
  viewerCount: {
    main: "#0099f5",
  },
}
```

All streaming surfaces consume `theme.palette.live.*` / `theme.palette.stream.*`; never raw hex.

**J2. Custom typography role.** Add `streamMeta` and `liveTimer` typography variants in `theme.typography`. Used by `<StreamMetaPill>`, `<LiveBroadcastBadge>`, `<AdaptationToast>` for consistent sizing.

**J3. Component overrides** (extend `theme.components`):

- `MuiIconButton`: `size="large"` defaults to `padding: 12px` to hit the 48dp target on mobile (Phase H4).
- `MuiChip`: a `live` variant with red-glow border-pulse animation.
- `MuiPaper`: `streaming` variant that consumes `palette.stream.surface` and applies a subtle inner shadow.
- `MuiTooltip`: monospace constraint-message variant for the constraint engine (Phase C).

**J4. Animation tokens.** A `theme.transitions.streaming` namespace with named durations (`pip-enter: 220ms`, `chrome-fade: 160ms`, `live-pulse: 1600ms`). All streaming animations cite a token; never hardcode a duration.

**J5. Density-aware spacing.** The existing `darkTheme.js` already toggles `spacingMultiplier` between desktop (8) and mobile (4) — verify all new streaming components use `theme.spacing(n)` so they ride this toggle correctly.

**J6. Reduced motion.** `prefers-reduced-motion` is honored: the live pulse becomes a static dot, `AdaptationToast` fades-only (no slide-up), PiP transition becomes instant.

**J7. Audit pass.** After Phases C/H/I land, sweep `src/features/streaming/` and `src/features/player/` for `sx={{ color: "#xxx" }}` / `sx={{ background: "#xxx" }}` and replace with theme tokens. CI lint rule (Phase 0.5) gets an additional check banning hex literals in `sx` for those two directories.

---

## Code organization & implementation notes

### Top-level layout (target shape after this plan)

```
src/features/player/                          -- (renderer) viewer player
  LiveStreamPlayer.jsx                        -- composition shell, ≤180 lines
  viewerProbe.js                              -- already in place (308 lines)
  useLiveControlClient.js                     -- already in place (196 lines)
  hooks/
    useHlsPlayback.js                         -- (Phase 0)
    useNativeHls.js                           -- (Phase H)
    useLatencySync.js                         -- (Phase 0)
    usePlayerState.js                         -- (Phase 0)
    useFullscreen.js                          -- (Phase 0)
    usePlayerLayout.js                        -- (Phase H)
    useTouchGestures.js                       -- (Phase H)
    usePictureInPicture.js                    -- (Phase I)
    useWakeLock.js                            -- (Phase H)
  controls/
    PlayPauseButton.jsx
    VolumeControl.jsx
    LiveSyncButton.jsx
    FullscreenButton.jsx
    PictureInPictureButton.jsx                -- (Phase I)
    StreamMetaPill.jsx
  overlays/
    LoadingOverlay.jsx
    ErrorOverlay.jsx
    BufferingIndicator.jsx
    AdaptationToast.jsx                       -- (Phase F-α)
  pip/
    DocumentPipPortal.jsx                     -- (Phase I, Document-PiP container)
    FallbackFloatingCard.jsx                  -- (Phase I, portal fallback)

src/features/streaming/                       -- (renderer) broadcaster UI
  ui/
    StreamingPage.jsx                         -- thin shell that composes panels (Phase C)
    panels/
      SourcePanel.jsx                         -- (Phase D + C)
      AudioMixer.jsx                          -- (Phase E)
      OutputPanel.jsx                         -- (Phase C)
      AdvancedPanel.jsx                       -- (Phase C)
      LiveStatusPanel.jsx                     -- already in place (273 lines)
    controls/
      FieldWithConstraint.jsx                 -- input + constraint badge + tooltip
      ProfileSelector.jsx
      ResolutionPicker.jsx
      BitratePicker.jsx
      CodecPicker.jsx
    badges/
      LiveBroadcastBadge.jsx                  -- (Phase I)
      ViewerPresenceBadge.jsx                 -- (Phase I)
    hooks/
      useStreamSettings.js                    -- (Phase B)
      useCapabilities.js                      -- (Phase A)
      useLiveControl.js                       -- subscribes to server control channel
      useStreamLifecycle.js                   -- start/stop, status (Phase 0)
      useConstraints.js                       -- runs constraint engine on (settings, capabilities)
    formatters/
      bitrate.js, resolution.js, latency.js   -- pure display helpers
  state/
    settingsReducer.js                        -- pure reducer; no IPC
    derivedFields.js                          -- gopSize-follows-fps, etc.
  __tests__/

src/lib/streaming/                            -- shared business logic (renderer only)
  constraints/                                -- (Phase C)
    index.js
    videoCodec.js
    nvenc.js
    audio.js
    resolution.js
    bitrate.js
    initialCeiling.js
  detectProfile.js                            -- (Phase C)
  autoOptimize.js                             -- (Phase C; potentially imports public/streaming/autoOptimize.js)
  validators.js

src/slices/
  liveSessionSlice.js                         -- (Phase 0) broadcaster + viewer presence

shared/streaming/                             -- already in place
  types.js                                    -- 185 lines
  protocol.js                                 -- 162 lines
  PROTOCOL.md                                 -- (Phase F-ε) human-readable spec

public/streaming/                             -- main process (Electron)
  capabilities/
    probe.js                                  -- already in place (~161 lines, monolithic)
    ffmpegCheck.js                            -- (Phase A1, extract)
    gpuDetect/                                -- (Phase A1, extract)
      index.js
      win32.js
      darwin.js
      linux.js
    audioDevices.js                           -- (Phase A1, extract)
    displays.js                               -- (Phase A1, extract)
  settings/                                   -- already in place
    store.js
    schema.js
    migrate.js
    steps/
  capture/                                    -- already in place (incl. file.js)
    gfxcapture.js, gdigrab.js, avfoundation.js, x11grab.js, file.js, index.js
  encoder/                                    -- already in place
    nvenc.js, qsv.js, videotoolbox.js, software.js, amf.js, vaapi.js, _vbv.js, index.js
  audio/                                      -- new (Phase E)
    sources/
      microphone.js
      desktopLoopback.js
      processInclude.js
      processExclude.js
      fileAudio.js
    filterGraph.js
    levelMeter.js
  output/                                     -- already in place (hls.js)
  uploader/                                   -- already in place
  server-control/                             -- already in place
    socket.js, adapter.js, initialCeiling.js, segmentCursor.js
  pipeline.js                                 -- already in place
  manager/                                    -- (Phase 0.2 split of electron-live-stream.js)
    ElectronLiveStreamManager.js              -- ≤300 lines
    adaptationLoop.js
    serverControlBridge.js
    respawn.js
  ipc/                                        -- (Phase 0.2 split)
    register.js
    handlers/
      session.js, capabilities.js, settings.js, adaptation.js
  autoOptimize.js                             -- already in place

native-helpers/
  windows-process-loopback/                   -- (Phase E)
    src/                                      -- Rust or C++
    Cargo.toml | CMakeLists.txt
    README.md
```

### Cross-process boundaries

Exactly **three** boundaries:

1. **Renderer ↔ Main (IPC)** — all channels namespaced under `live-stream:*` and `capabilities:*` (Phase A3) and `settings:*`, registered exclusively from `public/streaming/ipc/register.js`. Components never call `window.electronAPI` directly — only hooks do.
2. **Main ↔ Native helper (stdin/stdout)** — line-delimited JSON on stdin, raw PCM on stdout. Protocol documented in `native-helpers/windows-process-loopback/README.md` with a version constant; mismatched versions fail loudly.
3. **Streamer ↔ Server (Socket.IO)** — message shapes in `shared/streaming/protocol.js` with `PROTOCOL_VERSION`, the `/live-control` namespace mounted by `server/src/live/control/socket.js`, both viewers and streamers connect via the typed envelopes. Both sides import from the same file.

### Architectural rules (enforced via Phase 0.5 lint gate)

**Renderer:**

- Hooks own IPC. Components import hooks only. `ipcRenderer` in a component is a bug.
- Reducers are pure. Persistence is a side effect in `useStreamSettings`'s `useEffect`, not the reducer.
- Constraints are pure. Each file in `src/lib/streaming/constraints/` exports `(settings, capabilities) => ConstraintResult[]`. Adding a constraint = new file + one-line registration.
- No business logic in JSX.
- No raw hex in `sx` for `src/features/streaming/` and `src/features/player/`. Use `theme.palette.*` tokens.

**Main process:**

- Pure argv builders in `capture/`, `encoder/`, `output/`, `audio/filterGraph.js`. They take config and return string arrays. No spawning, logging, or disk I/O.
- Side effects isolated: spawn in `manager/`, file I/O in `uploader/fileSource.js` and `settings/store.js`, network I/O in `uploader/httpClient.js` and `server-control/socket.js`.
- Manager is thin: ≤300 lines, orchestrates subsystems, does not build argv.
- ≤200 lines per file (≤300 for designated orchestrator files: `manager/ElectronLiveStreamManager.js`, `pipeline.js`, the route shells).

**Server:**

- Control modules in `server/src/live/control/` are independent of the existing `service.js` / `runtime.js` / `playlist.js` so the namespace can evolve without churning the HLS upload path.

### Type discipline

`shared/streaming/types.js` is the canonical home for cross-process JSDoc typedefs (already in place). Configure `jsconfig.json` with `checkJs: true` so types are enforced on save. Add the missing `BroadcasterPresence` and `ViewerPresence` typedefs (Phase 0/I) to the same file.

### Testing strategy

- **Pure modules** (constraints, argv builders, planners, adapters, autoOptimize) — unit tests, snapshot tests for argv.
- **Pure renderer state** (reducers, derived fields, formatters, presence slice) — unit tests.
- **Hooks** — React Testing Library + fake IPC + fake Socket.IO. `useHlsPlayback`, `useLiveControlClient`, `usePictureInPicture`, `useTouchGestures`, `useStreamSettings`, `useCapabilities` all carry tests.
- **IPC handlers** — call directly with synthetic args.
- **Integration** — one harness per phase that wires real modules with fake I/O. Phase F-δ adds the cross-process integration suite.
- **Native helper** — its own test suite in `native-helpers/windows-process-loopback/` plus CI smoke test on Windows runners.
- **Mobile UI** — Playwright with the validation matrix devices (Phase H9), running headless on CI; manual smoke pass per release on a real iPhone and Pixel.

---

## Migration & rollout

- **Phase 0** ships first. It is the long pole; budget two iterations.
- **Phase A polish + Phase B finish** ship together as invisible plumbing once Phase 0 lands.
- **Phase D UI** ships standalone — backend already done.
- **Phase C** ships behind `featureFlags.newStreamingPage` for one release so we can A/B against the existing UI. Default it on after one release of dogfooding.
- **Phase H + Phase I** ship together: PiP only matters once the player has a clean composition surface and a Redux presence slice; the mobile work uses both.
- **Phase F polish** ships alongside Phase H (the adaptation toast lives in the new mobile-friendly chrome).
- **Phase J** ships as a sweep after Phases C/H/I — styling the final component set, not a moving target.
- **Phase E** ships alone. The native helper needs CI build infrastructure; budget the time for that.
- **Phase G** ships piecemeal alongside any other phase.

---

## Validation

- **Phase 0:** `git ls-files | xargs wc -l | sort -nr` shows no streaming-area file >300 lines except the documented exemptions; CI gate enforces it. The 113 streaming + 53 server tests still pass; per-split smoke tests added.
- **Phase A:** persistence survives crash, app update, and OS restart. Probe runs in <500 ms on a warm disk. `useCapabilities` returns identical data via the new `capabilities:get` IPC and the legacy `live-stream:get-detected-capabilities` IPC during the deprecation window.
- **Phase B:** `useStreamSettings` round-trips settings without losing fields. Reset dialog enumerates the changes in plain language. Save throttles to ≤1 write/second under rapid form input.
- **Phase C:** every existing FFmpeg-error path that we've seen in support tickets is now blocked at the UI level (write a test fixture per known bad combo). The constraint engine test suite covers all invalid combos from Plans 01 and 02.
- **Phase D:** stream a local 1080p60 mp4 for 10 minutes; verify the produced HLS plays correctly and segment cadence matches `hls_time`. Loop toggle works without re-spawning the upload pipeline.
- **Phase E:** capture mic + desktop + game-include in three concurrent sources; verify levels are correct, no double-audio, mute works in real time.
- **Phase F:**
  - Existing 28-test suite still green.
  - New cross-process integration test (Phase F-δ) covers viewer-connect → bandwidth-drop → recommendation → ACK → respawn.
  - `viewerProbe.js` unit test: mock `MediaSource.isTypeSupported`, `mediaCapabilities.decodingInfo`, and `navigator.connection`; assert `ViewerCapabilities` shape and `supportedCodecFamilies` derivation are correct across browsers that support none, some, or all of the three tiers.
  - Verify `viewer-capabilities` message is sent on Socket.IO connect; open the player in a browser that does not support HEVC and confirm `supportedCodecFamilies` omits `"hevc"`.
  - Throttle the player's network via Chrome devtools (2 Mbit); wait for 10 HLS segments; confirm `hlsBandwidthEstimateMbit` in the message is within range of the throttle setting.
  - Stream at 8 Mbit; open the player on a throttled network at 2 Mbit; observe the streamer respawn at ≤2 Mbit within ~3–5 seconds.
  - Open a second viewer at 1 Mbit; observe a further drop.
  - Close both viewers; observe the streamer raises back **up to (and never above) the initial ceiling** within `RAISE_DWELL_MS` (~8 s) of stable improvement. Re-open a slow viewer **before** that window elapses; observe the pending raise is cancelled and the streamer holds at the demoted state.
  - Manually set a value above the initial ceiling; UI rejects it.
  - `AdaptationToast` shows on `LEVEL_SWITCHED`; reduced-motion users see fade-only.
- **Phase G:** verify the health widget shows accurate values during artificial stalls (drop the ffmpeg process or pull the network). Per-session log dump matches what was streamed.
- **Phase H:**
  - Validation matrix (H9) green on every row.
  - Lighthouse mobile audit on `/live/<sessionId>` ≥ 90 for Performance, Accessibility, Best Practices.
  - All chrome respects `prefers-reduced-motion`.
  - Wake lock is acquired on play, released on pause and on `pagehide`.
- **Phase I:**
  - Strategy ladder degrades cleanly: a Chromium >=116 user gets Document-PiP; a Safari user gets native PiP; an obscure browser gets the portal fallback.
  - Broadcasting on `/live/broadcast` then navigating to every other route shows the `LiveBroadcastBadge`. Clicking returns to the broadcast page; right-click "Stop stream" stops it.
  - Watching a stream then navigating to `/profile` either enters PiP (when opted in) or shows `ViewerPresenceBadge`. Clicking it remounts the player on the same `sessionId` and seeks to live edge.
  - Closing the PiP window does not double-stop playback (no race with the route's own teardown).
- **Phase J:**
  - No raw hex in `sx` for `src/features/streaming/` or `src/features/player/` (lint rule).
  - All streaming-area animations cite a `theme.transitions.streaming.*` token.
  - Live-pulse animation halves to a static dot under `prefers-reduced-motion`.
  - The two existing component overrides in `darkTheme.js` (`MuiInputBase`, `MuiDrawer`) remain untouched; the new variants extend, never replace.
