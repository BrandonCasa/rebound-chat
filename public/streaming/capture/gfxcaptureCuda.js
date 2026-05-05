/**
 * Pure source-filter builder for the CUDA fast-path on Windows + NVIDIA.
 *
 * For SDR ("off"): emits `gfxcapture=...:output_fmt=nv12`.
 * For HDR ("convert" or "passthrough"): emits `output_fmt=p010` so the full
 * 10-bit signal reaches CUDA before tonemapping or passthrough encoding.
 *
 * The immediately-following `hwmap=derive_device=cuda:mode=read` maps the
 * D3D11 surface to a CUDA hwframe without a PCIe round-trip in all cases.
 *
 * @typedef {import("../types.js").StreamConfig} StreamConfig
 */

import * as gfxcapture from "./gfxcapture.js";

/**
 * @param {StreamConfig} config
 * @returns {string}
 */
const buildSourceFilter = (config) => {
	const outputFmt = config.hdrMode !== "off" ? "p010" : "nv12";
	// Capture at the source's native resolution. The downstream `scale_cuda`
	// step (built by videoFilter.buildCudaFastPath) handles any resize
	// **on the CUDA compute engine**, leaving the 3D engine free for the
	// rest of the desktop. When source dimensions already match the
	// configured output, scale_cuda's default `passthrough=1` makes it a
	// true no-op, so this is strictly a win or a wash — never a loss.
	return gfxcapture.buildSourceFilter(config, { outputFmt, resize: false });
};

/**
 * The hwmap step that converts the D3D11 NV12 hwframe to a CUDA hwframe
 * in-place. NVENC accepts CUDA hwframes directly, so no `hwdownload` is
 * needed.
 *
 * @returns {string}
 */
const buildHwMapStep = () => "hwmap=derive_device=cuda:mode=read";

export { buildSourceFilter, buildHwMapStep };
