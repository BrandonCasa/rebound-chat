/**
 * Pure builder for the `-init_hw_device` / `-filter_hw_device` argv that
 * sets up the appropriate hardware contexts.
 *
 * Two device families are emitted today:
 *
 *   1. **Windows + NVENC + gfxcapture** — sets up D3D11 plus a CUDA device
 *      derived from it, so the filter graph can do
 *      `hwmap=derive_device=cuda` on D3D11 surfaces and run
 *      `scale_cuda` / `tonemap_cuda` on CUDA hwframes. The CUDA device is
 *      bound to the filter graph via `-filter_hw_device cu`. NVENC
 *      consumes CUDA hwframes directly, so no `hwdownload` is needed.
 *
 *   2. **Linux + VAAPI encoder** — opens a VA-API device on
 *      `/dev/dri/renderD128` (the default render node referenced by the
 *      FFmpeg HWAccelIntro spec) and binds it to the filter graph via
 *      `-filter_hw_device va`. Required so the `format=nv12,hwupload`
 *      step inserted by `selectVideoFilter` can produce VAAPI surfaces
 *      that `*_vaapi` encoders can consume. Per HWAccelIntro: "hardware
 *      filters [...] may not support any formats in common with software
 *      filters – in such cases it may be necessary to make use of
 *      `hwupload` and `hwdownload` filter instances".
 *
 * Other paths (software encoders, AMF, QSV on a non-fast-path source,
 * VideoToolbox) don't require an explicit hwctx — FFmpeg opens what it
 * needs internally.
 *
 * @typedef {import("./types.js").StreamConfig} StreamConfig
 * @typedef {import("./types.js").Capabilities} Capabilities
 */

import { isNvencCodec, isVaapiCodec } from "./codecs.js";
import { usesGfxCapture } from "./capture/index.js";

const DEFAULT_VAAPI_DEVICE = "/dev/dri/renderD128";

/**
 * @param {StreamConfig} config
 * @param {Capabilities} capabilities
 * @returns {string[]}
 */
const buildHwDeviceArgs = (config, capabilities) => {
	if (capabilities.platform === "linux" && isVaapiCodec(config.videoCodec)) {
		const device = config.vaapiDevice || DEFAULT_VAAPI_DEVICE;
		return ["-init_hw_device", `vaapi=va:${device}`, "-filter_hw_device", "va"];
	}

	const onWindows = capabilities.platform === "win32";
	if (!onWindows) return [];

	const wantsCudaPath = isNvencCodec(config.videoCodec) && capabilities.supportsHwmapCudaFromD3D11 && usesGfxCapture(config, capabilities.platform);

	if (!wantsCudaPath) return [];

	return ["-init_hw_device", "d3d11va=dx", "-init_hw_device", "cuda=cu@dx", "-filter_hw_device", "cu"];
};

export { buildHwDeviceArgs, DEFAULT_VAAPI_DEVICE };
