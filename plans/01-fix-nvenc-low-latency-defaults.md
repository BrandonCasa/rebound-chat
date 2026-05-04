# Plan 01: Fix NVENC defaults that contradict the ULL tune

## Context

The streaming pipeline lives under `public/streaming/`. The modules relevant to this plan:

| File | Role |
|------|------|
| `public/streaming/defaults.js` | `buildDefaultSettings()` — source of truth for all initial setting values |
| `public/streaming/presets.js` | `DEFAULT_ENCODER_PRESETS`, `NVENC_PRESET_ALIASES`, `normalizeNvencPreset` |
| `public/streaming/platform/profiles.js` | `WIN32_X64`, `FALLBACK_PROFILE` — declare `defaults.encoderPreset` |
| `public/streaming/platform/index.js` | `defaultEncoderPresets()` — reads from `DEFAULT_ENCODER_PRESETS` and surfaces it to the renderer |
| `public/streaming/encoder/nvenc.js` | `buildArgs(config)` — the argv builder that will emit the corrected flags |
| `public/streaming/types.js` | `StreamConfig` typedef — the shape `buildArgs` consumes |
| `public/streaming/__tests__/pipeline.test.js` | Snapshot tests — `nvencEncoderTail()` helper must be updated |
| `public/streaming/__tests__/fixtures/configs.js` | `baseDefaults` — mirrors a normalized `StreamConfig`; must be updated |
| `public/streaming/__tests__/platform.test.js` | Asserts `encoderPreset === "p6"` for win32-x64; must be updated |

## Problem

The default NVENC settings in `defaults.js` are internally inconsistent. The tune is `ull` (ultra-low-latency), but other defaults force the encoder to buffer and re-encode every frame:

```55:64:public/streaming/defaults.js
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

The default encoder preset for `win32-x64` (from `platform/profiles.js`) is `"p6"` (slow). The same `"p6"` default is repeated in two other places:

- `platform/profiles.js` line 109 — `WIN32_X64.defaults.encoderPreset: "p6"`
- `platform/profiles.js` line 257 — `FALLBACK_PROFILE.defaults.encoderPreset: "p6"`
- `presets.js` line 59 — `DEFAULT_ENCODER_PRESETS.nvenc: "p6"` ← **also needs changing**

These combined defaults produce the following FFmpeg flags:

```
-preset p6 -tune ull -multipass fullres -rc vbr
-spatial_aq 1 -temporal_aq 1 -cq 23
-b_ref_mode middle -bf 3 -rc-lookahead 16
```

Each of those flags (except `-tune ull`) trades latency for quality.

## Why this should be fixed

- **`-rc-lookahead 16` at 30 fps = 533 ms held back before the first frame ever leaves the encoder.** Lookahead is a hard latency floor: the encoder cannot emit frame N until it has seen frame N+16.
- **`-multipass fullres`** runs a full first-pass encode at full resolution before the final pass. Roughly doubles per-frame GPU encode time and meaningfully increases NVENC engine occupancy. While gaming, the encoder is already competing for cycles; doubling the work is the difference between "real-time" and "falling behind."
- **`-bf 3` + `-b_ref_mode middle`** require frame reordering. The encoder must hold frames in the wrong display order until the reference structure is satisfied. Adds 3 frames (~100 ms at 30 fps, ~50 ms at 60 fps) of additional output latency on top of lookahead.
- **`-temporal_aq 1`** depends on lookahead to compute temporal information. With lookahead at zero (where it should be for live), temporal-AQ is essentially a quality cost with no benefit.
- **`-preset p6`** is "slow." Combined with `tune ull`, NVENC partially overrides the preset, but the intent is contradictory and we shouldn't rely on driver-internal coercion. `presets.js` already encodes this knowledge via `NVENC_PRESET_ALIASES`: `ll: "p4"` maps the "low-latency" semantic to p4.

End result on the user's machine: even with a perfect network and a perfectly fast capture path, the encoder is structurally adding ~600 ms of latency to every stream before any segment is even written.

## Expected result

- Glass-to-glass latency drops by ~500–700 ms in the encoder alone.
- NVENC engine usage drops by ~30–50% (no second pass), giving the game more headroom and reducing the chance of dropped frames.
- No visible quality regression at typical streaming bitrates (8 Mbit/s @ 1080p) — the spatial-AQ contribution is mild and lookahead's quality benefit is also mild at high bitrates.
- Fewer FFmpeg warnings about falling behind real time during fast motion.

## How to fix

### Step 1: Change defaults to a coherent low-latency profile

**`public/streaming/defaults.js` — lines 55–64** (`buildDefaultSettings`, NVENC block):

```
nvencTune: "ull",           // unchanged
nvencMultipass: "disabled", // was "fullres"
nvencRc: "vbr",             // unchanged
nvencCq: 23,                // unchanged
nvencSpatialAq: true,       // unchanged — small cost, real quality benefit
nvencTemporalAq: false,     // was true; meaningless without lookahead
nvencBRefMode: "disabled",  // was "middle"
nvencBFrames: 0,            // was 3
nvencLookahead: 0,          // was 16
```

**`public/streaming/platform/profiles.js` — three `encoderPreset` values to update:**

- Line 109: `WIN32_X64.defaults.encoderPreset` → `"p4"` (was `"p6"`)
- Line 257: `FALLBACK_PROFILE.defaults.encoderPreset` → `"p4"` (was `"p6"`)

`DARWIN`, `WIN32_ARM64`, `LINUX_X64`, and `LINUX_ARM64` all default to non-NVENC codecs (`videotoolbox`, `libsvtav1`) with non-p-series presets (`"realtime"`, `"8"`) — leave those untouched.

**`public/streaming/presets.js` — line 59:**

```js
DEFAULT_ENCODER_PRESETS.nvenc: "p4",  // was "p6"
```

`platform/index.js`'s `defaultEncoderPresets()` reads directly from `DEFAULT_ENCODER_PRESETS`, so this change propagates to whatever the renderer queries for the family-level default automatically.

### Step 2: How `nvenc.js` `buildArgs` already handles the new values

No changes needed to `encoder/nvenc.js`. The existing guard logic already suppresses the problematic flags when the new defaults are applied:

- **`nvencMultipass: "disabled"`** — line 34: `if (config.nvencMultipass !== "disabled")` → `-multipass` is not emitted.
- **`nvencLookahead: 0`** — line 43: `if (config.nvencLookahead !== null && config.nvencLookahead > 0)` → `-rc-lookahead` is not emitted.
- **`nvencBRefMode: "disabled"`** — line 41: emits `-b_ref_mode disabled` (valid FFmpeg flag to disable B-frame referencing; not suppressed, just set to `disabled`).
- **`nvencBFrames: 0`** — line 42: `if (config.nvencBFrames !== null)` → emits `-bf 0`, which is correct.
- **`nvencTemporalAq: false`** — line 37: emits `-temporal_aq 0`.

### Step 3: Add a streaming quality profile system

Create `public/streaming/profiles/` with curated presets that describe coherent encoding configurations:

- **Low Latency (gaming)** — the values from Step 1. This becomes the new effective default for NVENC.
- **Balanced** — `preset: p5`, `bf: 2`, `lookahead: 8`, `multipass: qres`, `temporalAq: true`.
- **Quality** — the old values (`preset: p6`, `bf: 3`, `lookahead: 16`, `multipass: fullres`, both AQs on).

Note: `public/streaming/platform/profiles.js` already exists and describes **PlatformProfiles** — which encoders and capture backends are available per OS/arch. The new `public/streaming/profiles/` directory describes **streaming quality profiles** — curated sets of NVENC (and later other encoder) parameters. These are different concepts.

Selecting a quality profile overwrites the dependent fields. Custom edits diverge from any profile (surfaced by `detectProfile` in Plan 04 when the renderer is built).

### Step 4: Surface the trade-off in the Settings UI (deferred to Plan 04)

The profile selector UI component and `detectProfile.js` renderer logic are deferred to Plan 04 Phase C, which rebuilds the settings page with a full constraint engine. This plan establishes only the data layer.

For now, confirm the constructed FFmpeg command reflects the new defaults by logging the argv before spawn.

### Step 5: Migrate existing users gracefully (deferred to Plan 04)

Full settings persistence and migration live in Plan 04 Phase B (`public/streaming/settings/store.js` and `migrate.js`). That is the correct home for versioned migration steps because it owns the file format and write path.

This plan does not add migration code. The behavior change takes effect for all users on next install because `buildDefaultSettings()` is the source of truth until Plan 04 adds persistence.

### Step 6: Match GOP to the actual output FPS

`gopSize: 60` in `defaults.js` assumes 30 fps × 2-second segments. This is a derived value, not a first-class setting. Extend `buildDefaultSettings` to accept `fps` and `hlsTime` as options and compute `gopSize` from them:

```js
// buildDefaultSettings now accepts { profile?, fps?, hlsTime? }
const buildDefaultSettings = (options = {}) => {
  const profile = options.profile || currentPlatformProfile();
  const fps = options.fps ?? 30;
  const hlsTime = Number(options.hlsTime ?? "2");
  const gopSize = fps * hlsTime;
  return {
    // ...
    fps,
    gopSize,
    hlsTime: String(options.hlsTime ?? "2"),
    // ...
  };
};
```

The test fixtures in `__tests__/fixtures/configs.js` already use `gopSize: 120` (60 fps × 2s), which matches this formula — no fixture change needed for gopSize.

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

## Tests to update

### `public/streaming/__tests__/fixtures/configs.js`

`baseDefaults` (lines 26–36) mirrors the raw NVENC config. Update to the new defaults:

```js
encoderPreset: "p4",       // was "p6"
nvencMultipass: "disabled", // was "fullres"
nvencTemporalAq: false,    // was true
nvencBRefMode: "disabled", // was "middle"
nvencBFrames: 0,           // was 3
nvencLookahead: 0,         // was 16
```

### `public/streaming/__tests__/pipeline.test.js`

The `nvencEncoderTail()` helper (lines 54–89) is the NVENC argv snapshot. After the change, the expected args become:

```js
const nvencEncoderTail = (preset = "p4") => [
  "-c:v", "h264_nvenc",
  "-g", "120", "-keyint_min", "120", "-sc_threshold", "0",
  "-b:v", "8M", "-maxrate", "8M", "-bufsize", "16000000",
  "-preset", preset,
  "-tune", "ull",
  // no -multipass (nvencMultipass: "disabled" suppressed by guard in nvenc.js line 34)
  "-rc", "vbr",
  "-spatial_aq", "1",
  "-temporal_aq", "0",    // was "1"
  "-cq", "23",
  "-b_ref_mode", "disabled", // was "middle"
  "-bf", "0",             // was "3"
  // no -rc-lookahead (nvencLookahead: 0 suppressed by guard in nvenc.js line 43)
];
```

The deepEqual assertions in the fast-path and legacy-fallback describe blocks will need updating to match this new shape.

### `public/streaming/__tests__/platform.test.js`

Line 163 asserts `s.encoderPreset === "p6"` for the win32-x64 profile:

```js
it("win32-x64: nvenc codec, gfxcapture, p6 preset", () => {
  // ...
  assert.equal(s.encoderPreset, "p6"); // ← change to "p4"
});
```

Update the test description string and assertion value to `"p4"`.

The existing `it("each profile's default encoderPreset is valid for its default codec")` test in the "declared codecs are internally consistent" describe block will continue to pass automatically since `p4` is in `NVENC_PRESET_LADDER`.

## Tests to add (`public/streaming/__tests__/profiles/`)

- Each profile is validated against the NVENC encoder's `buildArgs` — a profile cannot define a combo that would throw (e.g. `temporalAq: true` + `lookahead: 0` should warn, not error, at the profile level).
- `applyProfile` round-trip: applying a profile produces settings whose NVENC argv matches the profile's documented intent.
- Snapshot: the "Low Latency" profile's argv must not contain `-rc-lookahead`, `-bf` > 0, `-multipass fullres`, or `-b_ref_mode middle`.

## Validation

- Print the constructed FFmpeg argv to a log line and verify the new defaults appear.
- Stream while gaming with each profile; record glass-to-glass latency using an on-screen timer.
- Compare bitrate stability and visible artifacts on motion-heavy gameplay between the three profiles at 8 Mbit/s.
- Confirm no NVENC error or fallback messages in stderr.
- Run `node --test public/streaming/__tests__/pipeline.test.js` and `node --test public/streaming/__tests__/platform.test.js` — all tests must pass with updated snapshots.
