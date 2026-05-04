# Plan 04: Tighten the VBV buffer (`-bufsize`) for live HLS

## Problem

The encoder is told it has a 2-second VBV (Video Buffering Verifier) window:

```646:646:public/electron-live-stream.js
		cmd.push("-b:v", config.videoBitrate, "-maxrate", config.videoBitrate, "-bufsize", String(parseBitrateToBps(config.videoBitrate) * 2));
```

So at the default 8 Mbit/s, the encoder is permitted to emit anywhere between 0 and 16 Mbit before its average has to converge to 8 Mbit/s. In practice this means:

- During still scenes the encoder may "save up" bits.
- During motion (gaming!) it may emit a 2-second burst at far above the average bitrate.
- Across the burst the average is honored; within any given second it may not be.

For VOD or chunked-transfer live, this is fine. For live HLS where each `hls_time` segment is emitted, sealed, and uploaded as a discrete file, it isn't.

## Why this should be fixed

`hls_time` is 2 seconds. A `bufsize` of 2× `bitrate` allows the encoder to skew bit allocation by up to a full segment's worth. Concrete consequences:

- **Variable segment file sizes**: a "saved bits" segment may be 0.5 MB, the next "spending bits" segment may be 3.5 MB. The uploader (Plan 03) takes proportionally longer to push the bigger segment, increasing the chance of falling behind on a network-loaded machine (gaming).
- **Bitrate spikes hit the user's uplink unevenly**: a fixed 8 Mbit average that bursts to 14 Mbit/s for a second can saturate a contended uplink (typical home connection during a Discord call + game) and produce visible viewer-side stalls even though the average is well within budget.
- **Segments closer to `hls_time` in actual duration**: With a wide VBV window, NVENC has more freedom to defer GOP boundaries by a frame or two, producing segments with slightly variable durations. Most players tolerate this, but tight live windows (`hls_list_size: 6`, `hls_time: 2` = 12 s buffer) leave little slack.

The standard practice for live segmented streaming is `bufsize = bitrate` (or smaller), giving the encoder a 1-second window to balance bits. NVENC honors this for both `vbr` and `cbr` rate-control modes.

## Expected result

- Per-segment file sizes converge to roughly `bitrate × hls_time / 8` ± ~15% instead of ± ~50%.
- Lower peak instantaneous bitrate, which matters on contended residential uplinks.
- More predictable upload pass durations (Plan 03 benefits compound here).
- No noticeable quality difference at typical bitrates — at 8 Mbit/s for 1080p, the encoder has plenty of bits per frame regardless of VBV width.

## How to fix

### Step 1: Change the VBV computation

Replace:

```
cmd.push("-bufsize", String(parseBitrateToBps(config.videoBitrate) * 2));
```

with:

```
cmd.push("-bufsize", String(parseBitrateToBps(config.videoBitrate)));
```

That is, `bufsize = 1 × bitrate`.

### Step 2: Make the multiplier configurable for advanced users

Add a `vbvMultiplier` setting to `DEFAULT_SETTINGS`, defaulting to `1.0`. Allow `0.5`–`2.0`. Apply it in the same line:

```
cmd.push("-bufsize", String(Math.round(parseBitrateToBps(config.videoBitrate) * config.vbvMultiplier)));
```

This gives us a simple knob for users on flaky uplinks (push to `0.5`) or for users who want VOD-like quality and accept the latency/jitter trade-off (`2.0` = current behavior).

### Step 3: Surface it (optionally) in the Settings advanced panel

In `SettingsPage.route.jsx`, expose it under the same advanced section as the other NVENC fields, with a label like "VBV buffer (× bitrate)" and helper text: *"Lower = more uniform bitrate, recommended for live. Higher = better quality on motion-heavy scenes."*

Most users will never change it; it just lives next to the other tuning knobs.

### Step 4: Pair the change with `-rc cbr` as an optional profile

For users on capped uplinks (mobile hotspots, etc.), constant bitrate (`-rc cbr`) plus `bufsize = 0.5 × bitrate` is the safest live mode. We don't need to change defaults, but the profile selector from Plan 02 can include a "Stable Uplink" profile that flips to CBR + tight VBV.

### Validation

- After the change, compare per-segment sizes over a 60-second stream of motion-heavy gameplay. Standard deviation of segment sizes should drop noticeably.
- Watch FFmpeg's `bitrate=` output line; it should hover much closer to the configured bitrate.
- Confirm no `vbv underflow` or `bitrate overshoot` warnings appear in stderr at the new setting.
- Visual A/B: stream a fast-panning game scene at the old (`2×`) and new (`1×`) settings; verify no visible quality regression at the configured bitrate.
