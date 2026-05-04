# Changelog

All notable changes to this project will be documented here.

---

## [Unreleased] — 2026-05-04

### Added

- **GPU-resident capture pipeline (NVENC fast path)** — on Windows with an NVIDIA GPU, the screen-capture chain no longer round-trips through system RAM. The D3D11 surface produced by `gfxcapture` is mapped to CUDA in-place via `hwmap=derive_device=cuda` and fed directly into NVENC. This eliminates ~475 MB/s of PCIe readback at 1080p60, reduces CPU load during streaming, and cuts glass-to-glass latency by one copy. (`public/streaming/capture/gfxcaptureCuda.js`, `public/streaming/hwcontexts.js`)
- **Automatic fast-path fallback** — if the GPU pipeline exits non-zero within the first 3 seconds (e.g. due to a driver/FFmpeg version that cannot derive CUDA from D3D11), the manager automatically retries with the legacy CPU chain and logs a downgrade notice. (`public/streaming/pipeline.js` → `fallbackOnFailure`)
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

### Changed

- `ElectronLiveStreamManager.buildFfmpegCommand` now delegates to `pipeline.buildArgs`. The class retains only orchestration responsibility (spawning, uploading, heartbeat, session lifecycle).
- `gfxcapture` output format switches from `bgra` to `nv12` when the NVENC fast path is active. NV12 is NVENC's native input and half the bytes per pixel of BGRA.
- `fps=` and `scale_cuda=` filters are only inserted into the fast-path chain when they are actually needed (when output FPS differs from capture FPS, or when a resize is required). At 1080p60 with matching FPS the chain is just `gfxcapture → hwmap → nvenc` with nothing else in between.
- `fps=` in the legacy CPU chain is unchanged and still emitted unconditionally when `config.fps` is set.

### Fixed

- CPU color-conversion (`format=bgra` → `format=yuv420p`) is no longer performed on the main thread during NVENC streaming on Windows. The conversion previously competed with the game for CPU cores at 1080p60+.
- PCIe readback of captured frames is eliminated on the NVENC fast path. Previously ~475 MB/s of PCIe RX bandwidth was consumed at 1080p60 regardless of GPU load.

### Tests

- Added `public/streaming/__tests__/pipeline.test.js` — 13 snapshot tests across 8 suites covering the full encoder × capture × platform matrix (Windows/RTX/NVENC fast path, Windows/RTX/NVENC legacy, HDR→SDR, gdigrab+libx264, gfxcapture+libx264, manual input args, macOS/videotoolbox, Linux/libx264, QSV). Uses Node.js built-in `node:test`; no additional dev dependencies.
- Added `public/streaming/__tests__/fixtures/configs.js` — canonical normalized-config fixtures (`windowsRtxNvenc1080p60`, `windowsRtxNvenc1440pHdr`, `macAppleSilicon`, `linuxX11Software`, etc.).
- Added `pnpm run test:streaming` script to `package.json`.
