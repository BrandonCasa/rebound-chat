# Plan 02: Tighten the VBV buffer (`-bufsize`) for live HLS

## Status of prerequisites

- **Plan 01** (NVENC defaults + quality profiles): Must be complete before this plan. The `stableUplink` profile added in Step 4 goes into the profile system Plan 01 establishes.

## Problem

Every encoder module that sets a bitrate ceiling currently uses a 2-second VBV window. In `public/streaming/encoder/nvenc.js`:

```31:31:public/streaming/encoder/nvenc.js
	args.push("-b:v", config.videoBitrate, "-maxrate", config.videoBitrate, "-bufsize", String(parseBitrateToBps(config.videoBitrate) * 2));
```

The same `* 2` pattern appears in `qsv.js` and `software.js`. At the default 8 Mbit/s, the encoder is permitted to emit anywhere between 0 and 16 Mbit before its average has to converge to 8 Mbit/s.

For VOD or chunked-transfer live, this is fine. For live HLS where each `hls_time` segment is emitted, sealed, and uploaded as a discrete file, it isn't.

## Why this should be fixed

`hls_time` is 2 seconds. A `bufsize` of 2× `bitrate` allows the encoder to skew bit allocation by up to a full segment's worth. Concrete consequences:

- **Variable segment file sizes**: a "saved bits" segment may be 0.5 MB, the next "spending bits" segment may be 3.5 MB. The uploader (Plan 03) takes proportionally longer to push the bigger segment, increasing the chance of falling behind on a network-loaded machine.
- **Bitrate spikes hit the user's uplink unevenly**: a fixed 8 Mbit average that bursts to 14 Mbit/s for a second can saturate a contended uplink (typical home connection during a Discord call + game) and produce visible viewer-side stalls even though the average is well within budget.
- **Segment durations become variable**: with a wide VBV window, NVENC has more freedom to defer GOP boundaries, producing segments with slightly variable actual durations. Most players tolerate this, but tight live windows (`hls_list_size: 6`, `hls_time: 2` = 12 s buffer) leave little slack.

The standard practice for live segmented streaming is `bufsize = bitrate` (or smaller), giving the encoder a 1-second window to balance bits. NVENC, QSV, and libx264/libx265 all honor this for both `vbr` and `cbr` rate-control modes.

## Expected result

- Per-segment file sizes converge to roughly `bitrate × hls_time / 8` ± ~15% instead of ± ~50%.
- Lower peak instantaneous bitrate, which matters on contended residential uplinks.
- More predictable upload pass durations (Plan 03 benefits compound here).
- No noticeable quality difference at typical bitrates — at 8 Mbit/s for 1080p the encoder has plenty of bits per frame regardless of VBV width.

## How to fix

### Step 1: Create a shared `_vbv.js` utility

Add `public/streaming/encoder/_vbv.js`:

```js
import { parseBitrateToBps } from "../codecs.js";

/** @type {(bitrate: string, multiplier?: number) => number} */
export function computeVbvBufsize(bitrate, multiplier = 1.0) {
  return Math.round(parseBitrateToBps(bitrate) * multiplier);
}
```

This centralizes the math. Each encoder imports it; no copy-paste.

### Step 2: Update each encoder to use the utility

Replace the inline `* 2` computation in every encoder that currently does it:

- `public/streaming/encoder/nvenc.js`
- `public/streaming/encoder/qsv.js`
- `public/streaming/encoder/software.js`

Replace each occurrence of:
```
String(parseBitrateToBps(config.videoBitrate) * 2)
```
with:
```
String(computeVbvBufsize(config.videoBitrate, config.vbvMultiplier ?? 1.0))
```

`videotoolbox.js` and `amf.js` do not currently set `-bufsize` explicitly and should continue not to (VideoToolbox honors `-bufsize` loosely; AMF manages its own VBV internally). Document this in a comment in each file.

### Step 3: Add `vbvMultiplier` to the type and defaults

In `public/streaming/types.js`, add to the `StreamConfig` typedef:
```
 * @property {number} vbvMultiplier  -- VBV buffer = bitrate × this; default 1.0 (1-second window)
```

In `public/streaming/defaults.js`, add to `buildDefaultSettings()`:
```js
vbvMultiplier: 1.0,
```

### Step 4: Add the `stableUplink` profile

Using the profile system established in Plan 01, add `public/streaming/profiles/stableUplink.js`:

```js
export default {
  id: "stable-uplink",
  label: "Stable Uplink",
  description: "CBR with a tight VBV buffer. Best for mobile hotspots and capped uplinks.",
  latencyHint: "Similar to Low Latency but with more predictable per-second bitrate.",
  values: {
    nvencRc: "cbr",
    vbvMultiplier: 0.5,
    nvencTune: "ull",
    nvencMultipass: "disabled",
    nvencLookahead: 0,
    nvencBFrames: 0,
    nvencBRefMode: "disabled",
    nvencTemporalAq: false,
  },
};
```

Register it in `public/streaming/profiles/index.js` alongside the profiles from Plan 01.

### Step 5: Expose `vbvMultiplier` in the Settings advanced panel (deferred to Plan 04)

The UI knob ("VBV buffer (× bitrate)") is deferred to Plan 04 Phase C's advanced settings panel. The field exists in the config from Step 3; Plan 04 adds the control.

## Code organization & implementation notes

The shared utility lives in one place (`encoder/_vbv.js`). Each encoder is the natural owner of its own VBV call — it already owns the `-b:v`/`-maxrate` args immediately before it.

**Tests** (`public/streaming/__tests__/`):

- `vbv.test.js` — pure-function unit tests on `computeVbvBufsize`: `"8M"` at multiplier `1.0` → `8_000_000`; at `0.5` → `4_000_000`; at `2.0` → `16_000_000`.
- Update the existing NVENC/QSV/software pipeline snapshot tests (in `pipeline.test.js` and its fixtures) to expect the new `-bufsize` value. The snapshots changing is the review — verify the new values match the expected 1× multiplier.
- Add snapshot variants with `vbvMultiplier: 0.5` and `vbvMultiplier: 2.0` and lock the resulting argv.

**`vaapi.js` note:** VAAPI doesn't use `-bufsize` in the same way; its rate control is driver-managed. Leave it without a `computeVbvBufsize` call and add a comment explaining why.

## Validation

- After the change, compare per-segment sizes over a 60-second stream of motion-heavy gameplay. Standard deviation of segment sizes should drop noticeably.
- Watch FFmpeg's `bitrate=` output line; it should hover much closer to the configured bitrate.
- Confirm no `vbv underflow` or `bitrate overshoot` warnings appear in stderr at the new setting.
- Visual A/B: stream a fast-panning game scene at the old (`2×`) and new (`1×`) settings; verify no visible quality regression at the configured bitrate.
