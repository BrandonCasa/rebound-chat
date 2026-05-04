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
 * Whether the fast path needs an explicit `scale_cuda` step.
 *
 * The gfxcapture source itself handles resize via its `width=`, `height=`,
 * and `resize_mode=` options whenever `outputWidth`/`outputHeight` are set,
 * so frames already arrive at the requested size in NV12. `scale_cuda`
 * would be a redundant pass. We keep the helper as the single decision
 * point in case a future config opts out of gfxcapture's built-in resize.
 *
 * @param {StreamConfig} _config
 * @returns {boolean}
 */
const needsResize = (_config) => false;

/**
 * Whether to insert an `fps` step. Skipped when capture and output FPS
 * match, since the filter is then a no-op.
 *
 * @param {StreamConfig} config
 * @returns {boolean}
 */
const needsFps = (config) => Boolean(config.fps && config.fps !== config.captureFps);

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
 *   gfxcapture(nv12) → hwmap(cuda) → [scale_cuda] → [fps] → nvenc
 *
 * hdrMode "convert":
 *   gfxcapture(p010) → hwmap(cuda) → tonemap_cuda(hable→nv12) → [fps] → nvenc
 *   Everything stays in VRAM; zero CPU video work.
 *
 * hdrMode "passthrough":
 *   gfxcapture(p010) → hwmap(cuda) → [fps] → nvenc
 *   NVENC encodes 10-bit HDR directly; colour metadata is added by the encoder.
 *
 * scale_cuda is kept as a future hook (currently gfxcapture handles resize).
 * fps is only inserted when the requested fps differs from captureFps.
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
		filters.push(`scale_cuda=${config.outputWidth}:${config.outputHeight}:format=${fmt}`);
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
