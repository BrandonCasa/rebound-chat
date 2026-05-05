# Changelog

All notable changes to this project will be documented here.

---

## [Unreleased] — 2026-05-04

### Fixed (correction to the same release)

- **The "NVENC GPU-resident fast path" described below never worked on stock FFmpeg.** Three independent claims it relied on are not real FFmpeg features:
  - `-init_hw_device cuda=cu@dx` — `cuda_device_derive` in `libavutil/hwcontext_cuda.c` only accepts `AV_HWDEVICE_TYPE_VULKAN` as a source; deriving CUDA from a D3D11VA device returns `AVERROR(ENOSYS)`.
  - `hwmap=derive_device=cuda` from a D3D11 frame — same root cause.
  - `gfxcapture=...:output_fmt=nv12` / `output_fmt=p010` — `vsrc_gfxcapture.c`'s `output_fmt` AVOption only accepts `bgra` (`8bit`), `x2bgr10` (`10bit`), and `rgbaf16` (`16bit`). The "legacy fallback" also passed `output_fmt=nv12`, so it errored at filter init too.
- **The pipeline now follows the architecture documented in `HWAccelIntro` § CUDA ("NVENC can accept d3d11 frames context directly") and the `gfxcapture` filter doc.** No `-init_hw_device`, no `hwmap`, no CUDA derivation: gfxcapture's D3D11 hwframe goes straight into `*_nvenc`. NVENC handles D3D11→encoder registration internally via `NV_ENC_INPUT_RESOURCE_TYPE_DIRECTX`.
  - SDR: `gfxcapture(bgra,sized) → fps → nvenc`.
  - HDR passthrough: `gfxcapture(x2bgr10,sized) → fps → nvenc` — NVENC's HEVC wrapper auto-forces the `MAIN10` profile when input is 10-bit (see `IS_10BIT(...)` in `libavcodec/nvenc_hevc.c`); we additionally pin `-profile:v main10` to surface a clear error if upstream ever degrades to 8-bit.
  - HDR convert: `gfxcapture(bgra,sized) → hwdownload → format=bgra → zscale/tonemap=hable → format=yuv420p → fps → nvenc` (CPU). The on-GPU alternative would require a Vulkan-as-bridge device (`d3d11va → vulkan → cuda → tonemap_cuda`) which we do not ship; deferred.
  - Software / AMF / QSV via gfxcapture: `gfxcapture(bgra,sized) → hwdownload → format=yuv420p → fps → encoder`.
- Removed `Capabilities.supportsHwmapCudaFromD3D11`, `fallbackOnFailure`, and the spawn-side ENOSYS retry loop — they were workarounds for a fast path that never ran.
- Removed `public/streaming/capture/gfxcaptureCuda.js` and the CUDA branch of `public/streaming/hwcontexts.js`. The VAAPI branch of `hwcontexts.js` is retained — it is the only remaining `-init_hw_device` user and it is correct per `HWAccelIntro` § VAAPI.
- `gfxcapture` now refuses any `outputFmt` outside `{bgra, x2bgr10, rgbaf16}` at the builder level, so the same mismatch can't slip back in.
- Test snapshots in `public/streaming/__tests__/pipeline.test.js` updated to assert the corrected argv. The "Windows legacy fallback" and "fast path" describe blocks are gone — there is no longer a fast-vs-slow split. Added explicit assertions that `cuda=cu@dx`, `hwmap=derive_device=cuda`, and `-init_hw_device` never appear in the gfxcapture+NVENC argv.

The original (incorrect) entries from this release are preserved below for historical context.

### Added

- **GPU-resident capture pipeline (NVENC fast path)** — on Windows with an NVIDIA GPU, the screen-capture chain no longer round-trips through system RAM. The D3D11 surface produced by `gfxcapture` is mapped to CUDA in-place via `hwmap=derive_device=cuda` and fed directly into NVENC. This eliminates ~475 MB/s of PCIe readback at 1080p60, reduces CPU load during streaming, and cuts glass-to-glass latency by one copy. (`public/streaming/capture/gfxcaptureCuda.js`, `public/streaming/hwcontexts.js`) _[Superseded — see "Fixed (correction)" above.]_
- **Automatic fast-path fallback** — if the GPU pipeline exits non-zero within the first 3 seconds (e.g. due to a driver/FFmpeg version that cannot derive CUDA from D3D11), the manager automatically retries with the legacy CPU chain and logs a downgrade notice. (`public/streaming/pipeline.js` → `fallbackOnFailure`) _[Removed — see "Fixed (correction)" above.]_
- **Modular streaming pipeline** — `public/electron-live-stream.js` (~1 041 lines) has been decomposed into focused, pure modules under `public/streaming/`. Each module exports only pure functions (no `this`, no I/O, no logging) and is ≤200 lines:
  - `streaming/types.js` — shared JSDoc typedefs (`StreamConfig`, `Capabilities`, `ArgBuilder`)
  - `streaming/codecs.js` — codec classification helpers and `parseBitrateToBps`
  - `streaming/presets.js` — preset ladders and normalization per encoder family
  - `streaming/numbers.js` — `parsePositiveInt`, `parseOptionalPositiveInt`, `parsePositiveFloat`
  - `streaming/strings.js` — `splitCommandLine`, `escapeFilterValue`, screen-index parsing
  - `streaming/audio.js` — audio codec normalization
  - `streaming/defaults.js` — `DEFAULT_SETTINGS` and option lists
  - `streaming/output/hls.js` — pure HLS argv builder
  - `streaming/encoder/{nvenc,qsv,videotoolbox,software}.js` + `index.js` — per-family encoder argv builders
  - `streaming/capture/{gfxcapture,gfxcaptureCuda,gdigrab,avfoundation,x11grab}.js` + `index.js` — per-backend capture builders
  - `streaming/filters/videoFilter.js` — single decision point for fast vs. legacy filter chain (`selectVideoFilter`)
  - `streaming/hwcontexts.js` — D3D11 + CUDA hardware device context argv
  - `streaming/pipeline.js` — top-level composer; `buildArgs(config, capabilities)` returns the full argv
- **GPU-accelerated HDR→SDR (`hdrMode: "convert"`)** — replaces the CPU `zscale`/`tonemap=hable` chain with `tonemap_cuda` on the NVENC fast path. The D3D11 surface is captured as P010 (10-bit), mapped to CUDA, tonemapped to NV12 via CUDA NPP using the Hable curve (`peak=10`, `desat=0`), then encoded by NVENC — all in VRAM. Zero CPU video work, no PCIe round-trip. Falls back to the CPU `zscale` chain automatically when `supportsHwmapCudaFromD3D11` is false. (`public/streaming/filters/videoFilter.js`, `public/streaming/capture/gfxcaptureCuda.js`) _[Superseded — `tonemap_cuda` and the CUDA fast path were never reachable; see "Fixed (correction)" above. The CPU `zscale`/`tonemap=hable` chain is now the only `convert` path.]_
- **HDR passthrough streaming (`hdrMode: "passthrough"`)** — `gfxcapture` captures at P010 (10-bit) and the frames are mapped to CUDA and encoded directly by NVENC without any colour transform. The encoder emits BT.2020 primaries, SMPTE ST 2084 (PQ) transfer, and BT.2020nc colour matrix so players and CDN infrastructure treat the stream as HDR10. Recommended with HEVC or AV1; H.264 lacks standardised HDR10 signalling. (`public/streaming/encoder/nvenc.js`) _[Capture format corrected to `x2bgr10` (the actual 10-bit `gfxcapture` output); `hwmap` to CUDA removed — D3D11 hwframe goes straight into NVENC. BT.2020/PQ colour metadata behaviour is unchanged.]_

### Changed

- `ElectronLiveStreamManager.buildFfmpegCommand` now delegates to `pipeline.buildArgs`. The class retains only orchestration responsibility (spawning, uploading, heartbeat, session lifecycle).
- `gfxcapture` output format switches from `bgra` to `nv12` when the NVENC fast path is active in SDR mode. NV12 is NVENC's native input and half the bytes per pixel of BGRA. When `hdrMode` is `"convert"` or `"passthrough"`, `gfxcaptureCuda` requests `p010` (10-bit) instead, preserving the full HDR signal before CUDA processing. _[Superseded — `gfxcapture` does not accept `nv12` / `p010` as `output_fmt`. SDR now uses `bgra` and HDR passthrough now uses `x2bgr10`; see "Fixed (correction)" above.]_
- `fps=` and `scale_cuda=` filters are only inserted into the fast-path chain when they are actually needed (when output FPS differs from capture FPS, or when a resize is required). At 1080p60 with matching FPS the chain is just `gfxcapture → hwmap → nvenc` with nothing else in between.
- `fps=` in the legacy CPU chain is unchanged and still emitted unconditionally when `config.fps` is set.
- **`convertStreamToSdr: boolean` replaced by `hdrMode: "off" | "convert" | "passthrough"`** in `StreamConfig` (types.js) and `buildDefaultSettings` (defaults.js). The boolean was a two-state field that couldn't represent passthrough. Default is `"off"` (existing SDR behavior, no behaviour change for users who never touched the setting). `"convert"` maps to the previous `convertStreamToSdr: true` intent, now GPU-accelerated on the fast path.
- The NVENC fast path is no longer gated on the absence of HDR processing. Previously `convertStreamToSdr: true` forced the entire pipeline to CPU. Now `hdrMode: "convert"` keeps the fast path active and routes through `tonemap_cuda` instead. Only `supportsHwmapCudaFromD3D11: false` (driver failure or explicit fallback) drops to the legacy CPU chain.
- `hwcontexts.js` and `pipeline.js` — removed the `!config.convertStreamToSdr` guard from `wantsCudaPath` and `isNvencFastPath` respectively.

### Fixed

- CPU color-conversion (`format=bgra` → `format=yuv420p`) is no longer performed on the main thread during NVENC streaming on Windows. The conversion previously competed with the game for CPU cores at 1080p60+.
- PCIe readback of captured frames is eliminated on the NVENC fast path. Previously ~475 MB/s of PCIe RX bandwidth was consumed at 1080p60 regardless of GPU load.
- HDR-to-SDR conversion no longer forces a full CPU pipeline when streaming on Windows with NVENC. Previously enabling `convertStreamToSdr` discarded the GPU path entirely; `hdrMode: "convert"` now keeps the stream GPU-resident and uses `tonemap_cuda`.

### Tests

- Added `public/streaming/__tests__/pipeline.test.js` — snapshot tests across suites covering the full encoder × capture × platform matrix (Windows/RTX/NVENC fast path, Windows/RTX/NVENC legacy, HDR convert GPU, HDR convert CPU fallback, HDR passthrough, gdigrab+libx264, gfxcapture+libx264, manual input args, macOS/videotoolbox, Linux/libx264, QSV). Uses Node.js built-in `node:test`; no additional dev dependencies.
- Added `public/streaming/__tests__/fixtures/configs.js` — canonical normalized-config fixtures (`windowsRtxNvenc1080p60`, `windowsRtxNvenc1440pHdrConvert`, `windowsRtxNvenc1440pHdrPassthrough`, `macAppleSilicon`, `linuxX11Software`, etc.).
- Added `pnpm run test:streaming` script to `package.json`.
- Added two new test suites: **"Windows + NVENC + HDR convert (GPU tonemap_cuda)"** (3 cases: GPU path active, BT.709 metadata emitted, CPU fallback when CUDA unavailable) and **"Windows + NVENC + HDR passthrough"** (2 cases: P010 fast path, BT.2020/PQ metadata emitted). 17 tests total, all passing.
