# Plan 01: Fix NVENC defaults that contradict the ULL tune

## Context

The streaming pipeline is already split into modules under `public/streaming/`: `capture/`, `encoder/` (nvenc.js, qsv.js, videotoolbox.js, amf.js, vaapi.js, software.js), `output/hls.js`, `filters/videoFilter.js`, `pipeline.js`, `platform/profiles.js`, `defaults.js`, and `types.js`. All plans work on top of this structure.

## Problem

The default NVENC settings in `public/streaming/defaults.js` are internally inconsistent. The tune is `ull` (ultra-low-latency), but other defaults force the encoder to buffer and re-encode every frame:

```55:65:public/streaming/defaults.js
		nvencTune: "ull",
		nvencMultipass: "fullres",
		nvencRc: "vbr",
		nvencCq: 23,
		nvencSpatialAq: true,
		nvencTemporalAq: true,
		nvencBRefMode: "middle",
		nvencBFrames: 3,
		nvencLookahead: 16,
		gopSize: 60,
```

And the default encoder preset for `win32-x64` (set in `platform/profiles.js`) is `"p6"` (slow). These defaults produce:

```
-preset p6 -tune ull -multipass fullres -rc vbr
-spatial_aq 1 -temporal_aq 1 -cq 23
-b_ref_mode middle -bf 3 -rc-lookahead 16
```

Each of those (except `-tune ull`) trades latency for quality.

## Why this should be fixed

- **`-rc-lookahead 16` at 30 fps = 533 ms held back before the first frame ever leaves the encoder.** Lookahead is a hard latency floor: the encoder cannot emit frame N until it has seen frame N+16.
- **`-multipass fullres`** runs a full first-pass encode at full resolution before the final pass. Roughly doubles per-frame GPU encode time and meaningfully increases NVENC engine occupancy. While gaming, the encoder is already competing for cycles; doubling the work is the difference between "real-time" and "falling behind."
- **`-bf 3` + `-b_ref_mode middle`** require frame reordering. The encoder must hold frames in the wrong display order until the reference structure is satisfied. Adds 3 frames (~100 ms at 30 fps, ~50 ms at 60 fps) of additional output latency on top of lookahead.
- **`-temporal_aq 1`** depends on lookahead to compute temporal information. With lookahead at zero (where it should be for live), temporal-AQ is essentially a quality cost with no benefit.
- **`-preset p6`** is "slow." Combined with `tune ull`, NVENC partially overrides the preset, but the intent is contradictory and we shouldn't rely on driver-internal coercion.

End result on the user's machine: even with a perfect network and a perfectly fast capture path, the encoder is structurally adding ~600 ms of latency to every stream before any segment is even written.

## Expected result

- Glass-to-glass latency drops by ~500–700 ms in the encoder alone.
- NVENC engine usage drops by ~30–50% (no second pass), giving the game more headroom and reducing the chance of dropped frames.
- No visible quality regression at typical streaming bitrates (8 Mbit/s @ 1080p) — the spatial-AQ contribution is mild and lookahead's quality benefit is also mild at high bitrates.
- Fewer FFmpeg warnings about falling behind real time during fast motion.

## How to fix

### Step 1: Change defaults to a coherent low-latency profile

In `public/streaming/defaults.js`, within `buildDefaultSettings()`, replace the NVENC-specific defaults:

```
nvencTune: "ull"           // unchanged
nvencMultipass: "disabled" // was "fullres"
nvencRc: "vbr"             // unchanged
nvencCq: 23                // unchanged
nvencSpatialAq: true       // unchanged — small cost, real quality benefit
nvencTemporalAq: false     // was true; meaningless without lookahead
nvencBRefMode: "disabled"  // was "middle"
nvencBFrames: 0            // was 3
nvencLookahead: 0          // was 16
```

Also update `platform/profiles.js` — the `WIN32_X64` and `FALLBACK_PROFILE` entries have `defaults.encoderPreset: "p6"`. Change to `"p4"` (the documented sweet spot for low-latency NVENC).

### Step 2: Add a streaming quality profile system

Create `public/streaming/profiles/` with curated presets that describe coherent encoding configurations:

- **Low Latency (gaming)** — the values from Step 1. This becomes the new effective default for NVENC.
- **Balanced** — `preset: p5`, `bf: 2`, `lookahead: 8`, `multipass: qres`, `temporalAq: true`.
- **Quality** — the old values (`preset: p6`, `bf: 3`, `lookahead: 16`, `multipass: fullres`, both AQs on).

Note: `public/streaming/platform/profiles.js` already exists and describes **PlatformProfiles** — which encoders and capture backends are available per OS/arch. The new `public/streaming/profiles/` directory describes **streaming quality profiles** — curated sets of NVENC (and later other encoder) parameters. These are different concepts.

Selecting a quality profile overwrites the dependent fields. Custom edits diverge from any profile (surfaced by `detectProfile` in Plan 04 when the renderer is built).

### Step 3: Surface the trade-off in the Settings UI (deferred to Plan 04)

The profile selector UI component and `detectProfile.js` renderer logic are deferred to Plan 04 Phase C, which rebuilds the settings page with a full constraint engine. This plan establishes only the data layer.

For now, confirm the constructed FFmpeg command reflects the new defaults by logging the argv before spawn.

### Step 4: Migrate existing users gracefully (deferred to Plan 04)

Full settings persistence and migration live in Plan 04 Phase B (`public/streaming/settings/store.js` and `migrate.js`). That is the correct home for versioned migration steps because it owns the file format and write path.

This plan does not add migration code. The behavior change takes effect for all users on next install because `buildDefaultSettings()` is the source of truth until Plan 04 adds persistence.

### Step 5: Match GOP to the actual output FPS

`gopSize: 60` assumes 30 fps × 2-second segments. This is a derived value, not a first-class setting. Move the computation into `buildDefaultSettings()` as a derived field:

```js
const gopSize = (options.fps ?? 30) * Number(options.hlsTime ?? "2");
```

The renderer (Plan 04) will eventually drive this reactively. For now, making it explicit in `buildDefaultSettings` is sufficient and prevents the mismatch for users on 60 fps.

## Code organization & implementation notes

Quality profiles live in `public/streaming/profiles/` (new directory, not to be confused with `public/streaming/platform/profiles.js`):

```
public/streaming/profiles/
  index.js          -- exports STREAMING_PROFILES (array) + applyProfile(profile, settings)
  lowLatency.js     -- values for the gaming default
  balanced.js
  quality.js
  stableUplink.js   -- (added in Plan 02 when vbvMultiplier lands)
```

**Profile shape** (add to `public/streaming/types.js`):

```js
/** @typedef {Object} StreamingProfile
 *  @property {string} id                     -- "low-latency" | "balanced" | "quality" | "stable-uplink"
 *  @property {string} label                  -- display name
 *  @property {string} description            -- one-sentence explanation
 *  @property {string} latencyHint            -- "~500 ms glass-to-glass"
 *  @property {Partial<StreamConfig>} values
 */
```

Each profile file `export default`s one object. To add a new profile, add a file and register it in `index.js`. No edits to existing profiles needed.

**Applying a profile** is `{ ...currentSettings, ...profile.values }` — one line in `applyProfile`. No special-casing per profile.

**Tests** (`public/streaming/__tests__/profiles/`):

- Each profile is validated against the NVENC encoder's `buildArgs` — a profile cannot define a combo that would throw (e.g. `temporalAq: true` + `lookahead: 0` should warn, not error, at the profile level).
- `applyProfile` round-trip: applying a profile produces settings whose NVENC argv matches the profile's documented intent.
- Snapshot: the "Low Latency" profile's argv must not contain `-rc-lookahead`, `-bf` > 0, `-multipass fullres`, or `-b_ref_mode middle`.

**Where the GOP-follows-fps rule (Step 5) lives:**

`buildDefaultSettings` computes it for the static default. In Plan 04 Phase C's settings reducer, whenever `fps` or `hlsTime` changes and the user hasn't explicitly overridden `gopSize`, recompute it. Track a `gopSizeOverridden` flag in persisted settings (Plan 04 Phase B) so we know whether to recompute.

## Validation

- Print the constructed FFmpeg argv to a log line and verify the new defaults appear.
- Stream while gaming with each profile; record glass-to-glass latency using an on-screen timer.
- Compare bitrate stability and visible artifacts on motion-heavy gameplay between the three profiles at 8 Mbit/s.
- Confirm no NVENC error or fallback messages in stderr.
- Run `node --test public/streaming/__tests__/pipeline.test.js` — all snapshot tests must pass with the new defaults (update snapshots that change intentionally).
