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

import { isNvencCodec } from "../codecs.js";
import { gfxcapture, gfxcaptureCuda, usesGfxCapture } from "../capture/index.js";

/**
 * Whether the CUDA fast path should emit an explicit `scale_cuda` step.
 *
 * On the fast path we tell gfxcapture **not** to resize (see
 * `gfxcaptureCuda.buildSourceFilter`), so resize work moves off the
 * D3D11 video processor (3D engine) and onto CUDA cores (compute engine).
 * `scale_cuda` always runs when an explicit output size is configured;
 * its default `passthrough=1` makes it a no-op when the source already
 * matches, so there's no penalty for monitors that capture at the
 * configured resolution.
 *
 * @param {StreamConfig} config
 * @returns {boolean}
 */
const needsResize = (config) => Boolean(config.outputWidth && config.outputHeight);

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
 *  - the runtime told us the CUDA hwmap derivation failed.
 *
 * When hdrMode is "convert" on this path, a CPU zscale/tonemap chain handles
 * the HDR→SDR conversion (slower, but correct as a fallback).
 * When hdrMode is "passthrough" on this path, no colour transform is applied;
 * the gfxcapture BGRA capture already applies the OS-level SDR conversion, so
 * the result is SDR rather than true HDR — a graceful-ish degradation.
 *
 * Resize placement (best path available without setting up an extra hwctx):
 *
 *   - **gfxcapture inputs** keep their built-in `resize_mode=scale_aspect`.
 *     That's a D3D11 video-processor blit on the 3D engine — slower than
 *     `scale_cuda`, but `hwdownload` has already converted us to a CPU
 *     format by the time we'd want a CUDA scaler, so D3D11 is the fastest
 *     remaining option for the legacy fallback.
 *   - **gdigrab / x11grab / avfoundation inputs** use software `scale=`
 *     because the legacy chain doesn't initialize a hardware device for
 *     them. For software encoders that's optimal anyway. For paths like
 *     gdigrab+nvenc, gdigrab+qsv, x11grab+vaapi, or avfoundation+
 *     videotoolbox, a hwupload + `scale_<family>` would be more efficient
 *     but requires a per-family hwctx; that's a follow-up because it's
 *     not the default capture backend on any platform.
 *
 * @param {StreamConfig} config
 * @param {Capabilities} capabilities
 * @returns {string | null}
 */
const buildLegacyFilter = (config, capabilities) => {
	const filters = [];
	const usingGfxCapture = usesGfxCapture(config, capabilities.platform);

	if (usingGfxCapture) {
		filters.push(gfxcapture.buildSourceFilter(config));
		filters.push("hwdownload");
		filters.push("format=bgra");
	}

	if (config.hdrMode === "convert") {
		filters.push("zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv,format=yuv420p");
	}

	if (!usingGfxCapture && config.outputWidth && config.outputHeight) {
		filters.push(`scale=${config.outputWidth}:${config.outputHeight}:force_original_aspect_ratio=decrease`);
	}

	if (config.fps) {
		filters.push(`fps=${config.fps}`);
	}

	if (usingGfxCapture && config.hdrMode !== "convert") {
		filters.push("format=yuv420p");
	}

	return filters.length ? filters.join(",") : null;
};

/**
 * Build the GPU-resident NVENC fast path.
 *
 * hdrMode "off":
 *   gfxcapture(nv12, native size) → hwmap(cuda) → scale_cuda(nv12) → fps → nvenc
 *
 * hdrMode "convert":
 *   gfxcapture(p010, native size) → hwmap(cuda) → tonemap_cuda(hable→nv12)
 *     → scale_cuda(nv12) → fps → nvenc
 *
 * hdrMode "passthrough":
 *   gfxcapture(p010, native size) → hwmap(cuda) → scale_cuda(p010) → fps → nvenc
 *   NVENC encodes 10-bit HDR directly; colour metadata is added by the encoder.
 *
 * Why scale_cuda instead of letting gfxcapture resize:
 *   gfxcapture's built-in `resize_mode=scale_aspect` runs on the **D3D11 video
 *   processor**, which lives on the GPU's 3D engine. `scale_cuda` runs on the
 *   compute engine, so on a system that's also doing the rest of its work on
 *   3D (game, DWM, Electron compositor) we free up the busier queue. The two
 *   filters are effectively equivalent in quality for downscaling; both use
 *   the same dedicated silicon for sample fetches. `scale_cuda` defaults to
 *   `passthrough=1`, so when the source already matches the configured
 *   output it produces no work at all.
 *
 *   `force_original_aspect_ratio=decrease` mirrors gfxcapture's `scale_aspect`
 *   behaviour: never upscale, preserve aspect ratio when the source dims
 *   don't match the target's aspect.
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
