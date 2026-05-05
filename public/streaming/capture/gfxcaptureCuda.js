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
	// Let gfxcapture's D3D11 video processor do convert + resize in a
	// single fixed-function pass. On NVIDIA that path writes only the
	// configured output size (e.g. 1080p NV12 ≈ 3 MB/frame); a downstream
	// scale_cuda would force gfxcapture to write the source-native size
	// (e.g. 4K NV12 ≈ 12 MB/frame) and then redo the downscale on CUDA,
	// which is strictly more 3D-engine output bandwidth and more total
	// GPU work for high-resolution monitors.
	return gfxcapture.buildSourceFilter(config, { outputFmt });
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
