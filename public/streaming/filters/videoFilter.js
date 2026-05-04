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
 * Build the legacy CPU filter chain. Always used when:
 *  - the encoder is not NVENC, OR
 *  - HDR-to-SDR conversion is requested, OR
 *  - the runtime told us the CUDA hwmap derivation failed.
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

	if (config.convertStreamToSdr) {
		filters.push("zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv,format=yuv420p");
	}

	if (!usingGfxCapture && config.outputWidth && config.outputHeight) {
		filters.push(`scale=${config.outputWidth}:${config.outputHeight}:force_original_aspect_ratio=decrease`);
	}

	if (config.fps) {
		filters.push(`fps=${config.fps}`);
	}

	if (usingGfxCapture && !config.convertStreamToSdr) {
		filters.push("format=yuv420p");
	}

	return filters.length ? filters.join(",") : null;
};

/**
 * Build the GPU-resident NVENC fast path:
 *   gfxcapture(nv12) -> hwmap(cuda) -> [scale_cuda] -> [fps] -> nvenc
 *
 * scale_cuda is only inserted when the output resolution differs from the
 * capture resolution. fps is only inserted when the requested fps differs
 * from captureFps. When neither is needed, the chain is just two nodes.
 *
 * @param {StreamConfig} config
 * @returns {string}
 */
const buildCudaFastPath = (config) => {
	const filters = [gfxcaptureCuda.buildSourceFilter(config), gfxcaptureCuda.buildHwMapStep()];

	if (needsResize(config)) {
		filters.push(`scale_cuda=${config.outputWidth}:${config.outputHeight}:format=nv12`);
	}

	if (needsFps(config)) {
		filters.push(`fps=${config.fps}`);
	}

	return filters.join(",");
};

/**
 * Selects the fast or slow path. The decision lives only here.
 *
 * @param {StreamConfig} config
 * @param {Capabilities} capabilities
 * @returns {string | null}
 */
const selectVideoFilter = (config, capabilities) => {
	const onWindows = capabilities.platform === "win32";
	const usingGfxCapture = usesGfxCapture(config, capabilities.platform);
	const canUseFastPath =
		onWindows && usingGfxCapture && isNvencCodec(config.videoCodec) && capabilities.supportsHwmapCudaFromD3D11 && !config.convertStreamToSdr;

	if (canUseFastPath) {
		return buildCudaFastPath(config);
	}
	return buildLegacyFilter(config, capabilities);
};

export { selectVideoFilter, buildCudaFastPath, buildLegacyFilter };
