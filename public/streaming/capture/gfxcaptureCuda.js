/**
 * Pure source-filter builder for the CUDA fast-path on Windows + NVIDIA.
 *
 * Emits `gfxcapture=...:output_fmt=nv12` and the immediately-following
 * `hwmap=derive_device=cuda:mode=read` so frames stay in VRAM and are
 * mapped from D3D11 to CUDA without a PCIe round-trip.
 *
 * @typedef {import("../types.js").StreamConfig} StreamConfig
 */

import * as gfxcapture from "./gfxcapture.js";

/**
 * @param {StreamConfig} config
 * @returns {string}
 */
const buildSourceFilter = (config) => gfxcapture.buildSourceFilter(config, { outputFmt: "nv12" });

/**
 * The hwmap step that converts the D3D11 NV12 hwframe to a CUDA hwframe
 * in-place. NVENC accepts CUDA hwframes directly, so no `hwdownload` is
 * needed.
 *
 * @returns {string}
 */
const buildHwMapStep = () => "hwmap=derive_device=cuda:mode=read";

export { buildSourceFilter, buildHwMapStep };
