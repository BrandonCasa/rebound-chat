# Plan 01: Eliminate GPU → CPU → GPU round trip in the capture/encode pipeline

## Problem

When the user streams from a Windows 11 machine with an NVIDIA card, the default capture path is:

```
gfxcapture (D3D11 GPU surface)
  → hwdownload                    [GPU → CPU copy]
  → format=bgra                   [CPU memory layout]
  → format=yuv420p                [CPU color conversion]
  → h264_nvenc                    [CPU → GPU upload, then encode]
```

Built in `public/electron-live-stream.js`:

```555:582:public/electron-live-stream.js
	buildStreamVideoFilter(config, { includeCaptureSource = false } = {}) {
		const filters = [];
		const usingGfxCapture = includeCaptureSource && this.usesGfxCapture(config);

		if (usingGfxCapture) {
			filters.push(this.buildGfxCaptureSourceFilter(config));
			filters.push("hwdownload");
			filters.push("format=bgra");
		}
		// ...
		if (usingGfxCapture && !config.convertStreamToSdr) {
			filters.push("format=yuv420p");
		}
```

And the gfxcapture source filter is locked to BGRA output:

```531:553:public/electron-live-stream.js
	buildGfxCaptureSourceFilter(config) {
		// ...
		options.push("output_fmt=bgra");
		return `gfxcapture=${options.join(":")}`;
	}
```

## Why this should be fixed

At 1920×1080 BGRA @ 60 fps, the GPU → CPU readback alone is ~475 MB/s. The CPU then walks the same pixels twice (BGRA → YUV420P), and NVENC re-uploads them to VRAM. While the user is gaming, this work competes with the game for:

- **PCIe bandwidth** (the readback contends with the game's texture/shader streaming)
- **CPU cores** (color conversion is non-trivial at 1080p60+; worse at 1440p/4k)
- **System memory bandwidth**

NVENC on RTX 20–50 series accepts CUDA hardware frames directly. The D3D11 surface that `gfxcapture` already produces can be mapped to CUDA in-place (no copy across PCIe), then handed to NVENC. That is the architecturally correct path on this hardware.

## Expected result

- ~0 MB/s of capture-related PCIe readback (vs ~475 MB/s today at 1080p60)
- Lower CPU usage during streaming, especially on lower-core-count CPUs
- More stable game FPS while streaming
- Lower glass-to-glass latency (one fewer copy in the pipeline)
- Fewer "real-time skipped frame" warnings from FFmpeg under load

## How to fix

### Step 1: Verify the FFmpeg build supports the GPU-resident path

The shipped FFmpeg is BtbN `latest` `win64-lgpl-shared`. Confirm by running once during development:

```
ffmpeg -hide_banner -hwaccels
ffmpeg -hide_banner -filters | findstr /i "hwmap hwupload hwdownload gfxcapture scale_cuda"
ffmpeg -hide_banner -h filter=gfxcapture
```

Expected: `cuda`, `d3d11va`, `d3d12va` listed; `hwmap`, `scale_cuda`, `gfxcapture` present; gfxcapture's `output_fmt` accepts `nv12`.

### Step 2: Add a CUDA device when the encoder is NVENC

In `buildFfmpegCommand`, when `isNvencCodec(videoCodec)` is true, inject:

```
-init_hw_device d3d11va=dx -init_hw_device cuda=cu@dx -filter_hw_device cu
```

This registers a D3D11 device, derives a CUDA device from it (so they share the same adapter), and sets CUDA as the default device for filters that need one.

### Step 3: Switch gfxcapture to NV12 output

In `buildGfxCaptureSourceFilter`, when the encoder is NVENC, set `output_fmt=nv12` instead of `bgra`. NV12 is half the bytes per pixel of BGRA and is NVENC's native input format.

### Step 4: Replace the CPU filter chain with a hardware-resident chain for NVENC

In `buildStreamVideoFilter`, branch on whether the encoder is NVENC:

```
NVENC path (new):
  gfxcapture=...:output_fmt=nv12      [D3D11 NV12 hwframe]
  → hwmap=derive_device=cuda:mode=read [zero-copy D3D11 → CUDA]
  → scale_cuda=W:H:format=nv12         [optional, only if outputWidth/outputHeight differ]
  → fps=N                              [only if fps differs from captureFps]

Non-NVENC path (existing):
  gfxcapture → hwdownload → format=bgra → ... (unchanged)
```

`scale_cuda` and `fps` both accept CUDA hwframes; only insert them when needed (when scaling is required, or when `fps !== captureFps`). Skip them entirely otherwise — capture FPS should equal stream FPS by default to avoid the filter at all.

### Step 5: Drop unnecessary filters when capture and stream resolution match

If `outputWidth === captureWidth && outputHeight === captureHeight && fps === captureFps`, no scaling or fps filter is needed at all. The chain becomes just `gfxcapture → hwmap → nvenc`. Today the code unconditionally adds `scale=` and `fps=` even when they're no-ops.

### Step 6: Keep the SDR-conversion path on CPU but only enter it when requested

`convertStreamToSdr` requires zscale/tonemap, which is CPU-only in our build. When that flag is on, we must `hwdownload` first. Keep that branch intact and isolated — the default (HDR off, NVENC on) gets the fast path.

### Step 7: Provide a fallback if `hwmap` derivation fails

Some driver/FFmpeg combinations fail to derive CUDA from D3D11. Detect a non-zero exit during the first ~3 seconds of streaming and retry once with the legacy chain, logging the downgrade so we have telemetry.

## Code organization & implementation notes

`buildFfmpegCommand` is currently a ~100-line method on `ElectronLiveStreamManager` with capture, filter, encoder, and output arg-building all interleaved (`public/electron-live-stream.js` lines 584–680). Doing this work in-place would make it worse. Split it first, then add the fast path:

```
public/streaming/
  capture/
    index.js            -- selectBackend({ os, captureBackend, encoder }) → module
    gfxcapture.js       -- pure: buildSourceFilter(config) → string
    gfxcaptureCuda.js   -- pure: NEW; D3D11 → CUDA hwmap variant
    gdigrab.js
    avfoundation.js
    x11grab.js
  encoder/
    index.js            -- selectEncoder(videoCodec) → module
    nvenc.js            -- pure: buildArgs(config) → string[]
    qsv.js
    videotoolbox.js
    software.js
  output/
    hls.js              -- pure: buildArgs(config) → string[]
  filters/
    videoFilter.js      -- pure: chooses CPU SDR-conversion vs CUDA fast path
  hwcontexts.js         -- pure: buildHwDeviceArgs({ encoder, captureBackend }) → string[]
  pipeline.js           -- composes the above; no I/O; returns full argv
```

**Rules every module follows:**

- Each module under `streaming/` exports **only pure functions**. No mutable state, no `this`, no logging. They take a normalized config and return argv pieces.
- Composition happens in `pipeline.js` and only there. The class formerly known as `ElectronLiveStreamManager` calls `pipeline.buildArgs(config)` and forgets the rest.
- File size guideline: ≤200 lines per module. The current `electron-live-stream.js` (~1041 lines) becomes ~6–8 small modules plus a thin orchestrator.

**The decision between fast and slow path lives in one place.** Add `public/streaming/filters/videoFilter.js`:

```js
// The only file that knows about fast vs slow path selection.
export function selectVideoFilter(config, capabilities) {
  if (isNvenc(config) && supportsHwmapCudaFromD3D11(capabilities) && !config.convertStreamToSdr) {
    return buildCudaFastPath(config); // gfxcapture(nv12) → hwmap → optional scale_cuda → optional fps
  }
  return buildLegacyFilter(config);   // gfxcapture(bgra) → hwdownload → CPU
}
```

The fallback (Step 7) is implemented in `pipeline.js` as a higher-order wrapper that retries with `selectVideoFilter` told to skip the fast path. The retry policy is its own function (`fallbackOnFailure`) — not embedded in the spawn loop.

**Tests** (`public/streaming/__tests__/`):

- Snapshot tests on argv arrays. We do not run FFmpeg in tests; we assert the argv string for known configs is exactly correct. When defaults change, the snapshot diff *is* the review.
- Fixtures in `public/streaming/__tests__/fixtures/configs.js`: `windowsRtxNvenc1080p60`, `windowsRtxNvenc1440p60HDR`, `macAppleSilicon`, `linuxX11Software`, etc.
- One fixture per scenario × one snapshot per encoder = the matrix is small and exhaustive.

**Migration order** (each step ships independently and is reversible):

1. Extract `output/hls.js` (lowest risk, no behavior change). Land + lock with snapshots.
2. Extract per-encoder modules. Argv must match byte-for-byte before merging.
3. Extract per-capture modules. Same constraint.
4. Add the new `gfxcaptureCuda.js` and `selectVideoFilter.js` — only now do we add the fast path.
5. Wire the fallback retry in `pipeline.js`.

**JSDoc** the boundary types in `public/streaming/types.js`:

```js
/** @typedef {Object} StreamConfig ... */
/** @typedef {Object} Capabilities ... */
/** @typedef {(config: StreamConfig) => string[]} ArgBuilder */
```

These types are shared across encoder/capture/output modules so adding a new encoder is a one-file change with a known signature.

## Validation

- Watch `speed=` in ffmpeg stderr; should stay `≥1.0x` under gaming load
- Watch GPU and PCIe utilization in `nvidia-smi dmon -s pucvmet -c 30`; PCIe RX should drop substantially
- Verify the produced `init.mp4` and segments still play in browser HLS players (no color/format regression)
- If validation is not possible due to permissions, move on without validating, or validate by reading the code itself.