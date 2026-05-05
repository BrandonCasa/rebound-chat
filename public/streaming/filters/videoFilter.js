/**
 * Single source of truth for "which video filter chain do we use?".
 *
 * Returns a string suitable for `-vf` (when a single input is involved)
 * or for the body of `-filter_complex` (the caller appends `[v]`).
 *
 * Returns `null` when no filter is needed at all (the encoder will read
 * the raw input directly).
 *
 * @typedef {import("../types.js").StreamConfig} StreamConfig
 * @typedef {import("../types.js").Capabilities} Capabilities
 */

import { isNvencCodec, isVaapiCodec } from "../codecs.js";
import { gfxcapture, gfxcaptureCuda, usesGfxCapture } from "../capture/index.js";

/**
 * Whether the CUDA fast path should emit an explicit `scale_cuda` step.
 *
 * Today: never. gfxcapture's D3D11 video processor handles convert +
 * resize in one pass and outputs at the configured size, which is
 * strictly cheaper on the 3D engine than asking gfxcapture to write
 * source-native NV12 and then downscaling on CUDA (the latter forces
 * 3D-engine output bandwidth to scale with the source resolution
 * instead of the output resolution, hurting 4K/ultrawide monitors).
 *
 * Kept as a single decision point in case a future config explicitly
 * opts gfxcapture out of its built-in resize.
 *
 * @param {StreamConfig} _config
 * @returns {boolean}
 */
const needsResize = (_config) => false;

/**
 * Whether to insert an `fps` step.
 *
 * Inserted whenever `config.fps` is set, even when it equals
 * `config.captureFps`. The filter strictly drops any frames that arrive
 * faster than the configured target rate, providing a hard cap in
 * front of the encoder. Without it, a real-time capture source that
 * occasionally bursts above its declared `max_framerate` (gfxcapture
 * is not strict about this in practice) can push NVENC — especially
 * on low-latency presets like `p1` / `fast_live` — to encode faster
 * than the configured `fps`, producing video whose timeline outpaces
 * wall-clock playback.
 *
 * `effectiveCaptureFps()` already caps the source at fps + 15 %, so
 * the filter at most drops the residual 15 % overshoot — never
 * duplicates frames against an underrun.
 *
 * @param {StreamConfig} config
 * @returns {boolean}
 */
const needsFps = (config) => Boolean(config.fps);

/**
 * Build the legacy CPU filter chain. Used when:
 *  - the encoder is not NVENC, OR
 *  - the runtime told us the CUDA hwmap derivation failed (e.g. when
 *    the bundled FFmpeg build doesn't support `cuda=...@dx` at init
 *    time — which is the common case for BtbN's lgpl-shared without
 *    `--enable-cuda-nvcc`, so this chain is what most NVENC users
 *    are actually running).
 *
 * SDR + gfxcapture (the hot path):
 *   gfxcapture(nv12, sized)  ← D3D11 video processor: convert + resize
 *     → hwdownload          ← VRAM→system RAM at NV12 (1.5 B/px), 60 % less
 *                              PCIe traffic than the BGRA path used to do
 *     → fps                 ← cheap CPU pass (timestamps only)
 *     → encoder             ← NVENC, libx264, libsvtav1, libvvenc, libopenh264
 *                              all accept NV12 directly. libvpx-vp9 pins
 *                              `-pix_fmt yuv420p` and ffmpeg auto-inserts a
 *                              cheap NV12→YUV420p pass before encode for it.
 *
 * HDR convert + gfxcapture:
 *   gfxcapture(bgra, sized) → hwdownload → format=bgra
 *     → zscale linearise → gbrpf32le → bt709 → tonemap=hable → bt709 yuv420p
 *     → fps → encoder
 *   Stays on BGRA because zscale/tonemap operate in RGB space; the cost
 *   is unavoidable on a CPU fallback.
 *
 * HDR passthrough + gfxcapture:
 *   Treated like SDR (NV12 capture). gfxcapture's BGRA→NV12 path applies
 *   the OS-level HDR→SDR mapping, so the result is SDR rather than true
 *   HDR — a graceful degradation when CUDA isn't available.
 *
 * Non-gfxcapture inputs (gdigrab / x11grab / avfoundation):
 *   software `scale=` because no hwctx is initialized for these inputs.
 *   For software encoders that's optimal anyway. For hardware-encoder
 *   pairings (gdigrab+nvenc, gdigrab+qsv, x11grab+vaapi, avfoundation+
 *   videotoolbox) a hwupload + `scale_<family>` would be more efficient
 *   but requires a per-family hwctx; left as a follow-up because none of
 *   these is the default capture backend on its platform.
 *
 * @param {StreamConfig} config
 * @param {Capabilities} capabilities
 * @returns {string | null}
 */
const buildLegacyFilter = (config, capabilities) => {
	const filters = [];
	const usingGfxCapture = usesGfxCapture(config, capabilities.platform);
	const hdrConvert = config.hdrMode === "convert";
	// VAAPI encoders need VAAPI surfaces; we add `format=nv12,hwupload`
	// after any CPU-side processing. The matching VA-API device is opened
	// in `buildHwDeviceArgs` so this step has somewhere to upload to.
	const usingVaapi = isVaapiCodec(config.videoCodec);

	if (usingGfxCapture) {
		// HDR-convert needs RGB for zscale's tonemap; everything else
		// can ride NV12 straight from gfxcapture's D3D11 video processor.
		const outputFmt = hdrConvert ? "bgra" : "nv12";
		filters.push(gfxcapture.buildSourceFilter(config, { outputFmt }));
		filters.push("hwdownload");
		if (hdrConvert) {
			filters.push("format=bgra");
		}
	}

	if (hdrConvert) {
		filters.push("zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv,format=yuv420p");
	}

	if (!usingGfxCapture && config.outputWidth && config.outputHeight) {
		filters.push(`scale=${config.outputWidth}:${config.outputHeight}:force_original_aspect_ratio=decrease`);
	}

	if (usingVaapi) {
		filters.push("format=nv12", "hwupload");
	}

	if (config.fps) {
		filters.push(`fps=${config.fps}`);
	}

	return filters.length ? filters.join(",") : null;
};

/**
 * Build the GPU-resident NVENC fast path.
 *
 * hdrMode "off":
 *   gfxcapture(nv12, sized) → hwmap(cuda) → fps → nvenc
 *
 * hdrMode "convert":
 *   gfxcapture(p010, sized) → hwmap(cuda) → tonemap_cuda(hable→nv12) → fps → nvenc
 *   Everything stays in VRAM; zero CPU video work.
 *
 * hdrMode "passthrough":
 *   gfxcapture(p010, sized) → hwmap(cuda) → fps → nvenc
 *   NVENC encodes 10-bit HDR directly; colour metadata is added by the encoder.
 *
 * Resize lives inside gfxcapture: D3D11's video processor does convert +
 * downscale in a single fixed-function pass and outputs at the configured
 * size. That's the cheapest possible path on NVIDIA hardware for the
 * BGRA-source → NV12-target conversion that NVENC needs.
 *
 * Note: this path requires D3D11→CUDA derivation at init time
 * (`-init_hw_device cuda=cu@dx`). Some FFmpeg builds — including BtbN's
 * lgpl-shared without `--enable-cuda-nvcc` — return ENOSYS for that
 * derivation, in which case `pipeline.spawnFfmpeg` catches the early
 * exit and retries via `buildLegacyFilter`. The legacy chain is also
 * carefully tuned (NV12 end-to-end, no CPU pixel-format pass), so a
 * fallback is not catastrophic for performance.
 *
 * @param {StreamConfig} config
 * @returns {string}
 */
const buildCudaFastPath = (config) => {
	const filters = [gfxcaptureCuda.buildSourceFilter(config), gfxcaptureCuda.buildHwMapStep()];

	if (config.hdrMode === "convert") {
		// tonemap_cuda runs on CUDA NPP — no CPU involvement, no PCIe round-trip.
		// peak=10 → reference peak of 1000 nits (HDR10 standard).
		// Hable (Uncharted 2) curve is well-suited to high-contrast game content.
		filters.push("tonemap_cuda=tonemap=hable:format=nv12:peak=10:desat=0");
	}

	if (needsResize(config)) {
		const fmt = config.hdrMode === "passthrough" ? "p010" : "nv12";
		filters.push(`scale_cuda=${config.outputWidth}:${config.outputHeight}:format=${fmt}:force_original_aspect_ratio=decrease`);
	}

	if (needsFps(config)) {
		filters.push(`fps=${config.fps}`);
	}

	return filters.join(",");
};

/**
 * Selects the fast or slow path. The decision lives only here.
 *
 * The CUDA fast path is available for all hdrMode values when running on
 * Windows + gfxcapture + NVENC + CUDA derivation supported:
 *   "off"         → NV12 fast path (unchanged)
 *   "convert"     → tonemap_cuda on CUDA, output NV12 (GPU, no CPU hit)
 *   "passthrough" → P010 CUDA frames fed directly to NVENC
 *
 * @param {StreamConfig} config
 * @param {Capabilities} capabilities
 * @returns {string | null}
 */
const selectVideoFilter = (config, capabilities) => {
	const onWindows = capabilities.platform === "win32";
	const usingGfxCapture = usesGfxCapture(config, capabilities.platform);
	const canUseFastPath = onWindows && usingGfxCapture && isNvencCodec(config.videoCodec) && capabilities.supportsHwmapCudaFromD3D11;

	if (canUseFastPath) {
		return buildCudaFastPath(config);
	}
	return buildLegacyFilter(config, capabilities);
};

export { selectVideoFilter, buildCudaFastPath, buildLegacyFilter };
