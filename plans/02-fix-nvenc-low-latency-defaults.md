# Plan 02: Fix NVENC defaults that contradict the ULL tune

## Problem

The default NVENC settings are internally inconsistent. The tune is `ull` (ultra-low-latency), but other defaults force the encoder to buffer and re-encode every frame:

```98:110:public/electron-live-stream.js
	encoderPreset: "p6",
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

These defaults produce this NVENC command line:

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

### Step 1: Change `DEFAULT_SETTINGS` to a coherent low-latency profile

In `public/electron-live-stream.js`, replace the relevant defaults:

```
encoderPreset: "p4"        // p4 is the documented sweet spot for low-latency NVENC
nvencTune: "ull"           // unchanged
nvencMultipass: "disabled" // was "fullres"
nvencRc: "vbr"             // unchanged
nvencCq: 23                // unchanged (only used when relevant)
nvencSpatialAq: true       // unchanged — small CPU/GPU cost, real quality benefit
nvencTemporalAq: false     // was true; meaningless without lookahead
nvencBRefMode: "disabled"  // was "middle"
nvencBFrames: 0            // was 3
nvencLookahead: 0          // was 16
gopSize: 60                // unchanged (matches 2s segments at 30 fps)
```

### Step 2: Add a streaming profile selector with curated presets

Add a top-level setting `nvencProfile` (the codepath in `DesktopLivePage.route.jsx` already references `NVENC_PROFILE_DEFAULTS`; verify and populate it). Profiles:

- **Low Latency (gaming)** — the values above. This is the new default.
- **Balanced** — `preset: p5`, `bf: 2`, `lookahead: 8`, `multipass: qres`, `temporalAq: true`.
- **Quality** — current values (`preset: p6`, `bf: 3`, `lookahead: 16`, `multipass: fullres`, both AQs on).

Selecting a profile overwrites the dependent fields. Custom edits move the user back to a "Custom" pseudo-profile so we don't silently overwrite their tweaks.

### Step 3: Surface the trade-off in the Settings UI

In `SettingsPage.route.jsx`, add a one-line caption under the profile selector explaining that "Low Latency" is recommended while gaming, with an estimate of added latency for each profile. Keep advanced fields available for power users.

### Step 4: Migrate existing users gracefully

Persisted settings should keep working. Add a one-time migration: if the user has never explicitly chosen a profile and is currently on the old defaults exactly, move them to "Low Latency". Otherwise leave them on "Custom" with their existing values intact.

### Step 5: Match GOP to the actual output FPS

`gopSize: 60` assumes 30 fps × 2-second segments. If the user changes `fps` in the UI, `gopSize` should follow (`fps × hlsTime`) unless explicitly overridden. A mismatched GOP forces the encoder to insert keyframes at non-segment boundaries, which hurts both quality and segmentation.

## Code organization & implementation notes

Profiles are data, not logic. Treat them that way:

```
public/streaming/profiles/
  index.js              -- exports STREAMING_PROFILES (Map) + applyProfile()
  lowLatency.js         -- the values for the gaming default
  balanced.js
  quality.js
  stableUplink.js       -- (added in Plan 04)
src/lib/streaming/
  detectProfile.js      -- given current settings, returns matching profile id or "custom"
src/features/streaming/ui/controls/
  ProfileSelector.jsx   -- presentational; takes value + onChange + profiles list
```

**Profile shape** (in `public/streaming/profiles/types.js`, JSDoc):

```js
/** @typedef {Object} StreamingProfile
 *  @property {string} id                     -- "low-latency" | "balanced" | ...
 *  @property {string} label                  -- display name
 *  @property {string} description            -- one-sentence explanation
 *  @property {string} latencyHint            -- "~500 ms glass-to-glass"
 *  @property {Partial<StreamSettings>} values
 */
```

Each profile file `export default`s one object. To add a new profile, add a file and register it in `index.js`. No edits to existing profiles needed — open-closed.

**Applying a profile** is `{ ...currentSettings, ...profile.values }` and nothing else. No special-casing per profile. The applier lives in `applyProfile.js` as a one-liner.

**Detecting "custom"** — in the renderer hook `useStreamSettings`, after every settings change:

```js
const matched = detectProfile(settings);
// matched.id === "custom" means user has diverged from any preset
```

`detectProfile.js` walks the profile list, comparing each profile's defined keys against the current settings. The first complete match wins. If none match, `"custom"`. Pure function, trivially testable.

**Migration** (one-time move from old defaults to "low-latency"):

```
public/streaming/settings/
  migrate.js            -- versioned step functions + a runner
  steps/
    v0_to_v1.js         -- the old-defaults → low-latency migration
    v1_to_v2.js         -- (future)
```

Each step is `(settings) => settings` and is deterministic. `migrate.js` runs them in order based on `schemaVersion`. The Plan 02 migration is a single step: if `schemaVersion < 1` and the user's settings exactly match the legacy defaults, swap to `lowLatency.values` and set `nvencProfile: "low-latency"`.

**Tests** (`public/streaming/profiles/__tests__/`):

- Each profile is checked against the constraint engine — a profile cannot define an invalid combo.
- `detectProfile` round-trip: applying a profile then detecting it must return the same id.
- Migration: legacy fixture → migrated fixture, snapshot.

**Where the GOP-follows-fps rule (Step 5) lives:** in the renderer's settings reducer (`useStreamSettings`), as a derived field. Whenever `fps` or `hlsTime` changes and the user hasn't explicitly overridden `gopSize`, recompute it. Track an explicit-override flag (`gopSizeOverridden`) in persisted settings so we know whether to recompute. This is **not** in the profile system — profiles set initial values; this rule keeps them coherent over time.

## Validation

- Print the constructed FFmpeg command to a log line and verify the new defaults appear.
- Stream while gaming with each profile; record glass-to-glass latency using an on-screen timer (phone camera filming both monitor and laptop streaming view).
- Compare bitrate stability and visible artifacts on motion-heavy gameplay between the three profiles at 8 Mbit/s.
- Confirm no NVENC error or fallback messages in stderr.
