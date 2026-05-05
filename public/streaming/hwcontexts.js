/**
 * Pure builder for the `-init_hw_device` / `-filter_hw_device` argv that
 * sets up hardware device contexts.
 *
 * Today there is exactly one path that needs an explicit hwctx:
 *
 *   **Linux + VAAPI encoder** — opens a VA-API device on
 *   `/dev/dri/renderD128` (the default render node referenced by the
 *   FFmpeg HWAccelIntro spec) and binds it to the filter graph via
 *   `-filter_hw_device va`. Required so the `format=nv12,hwupload`
 *   step inserted by `selectVideoFilter` can produce VAAPI surfaces
 *   that `*_vaapi` encoders can consume. Per HWAccelIntro: "hardware
 *   filters [...] may not support any formats in common with software
 *   filters – in such cases it may be necessary to make use of
 *   `hwupload` and `hwdownload` filter instances".
 *
 * The Windows + NVENC + gfxcapture path does **not** need an
 * `-init_hw_device` line. `gfxcapture` is a filter-source that owns
 * its own D3D11 device (`AVFILTER_FLAG_HWDEVICE`), and `*_nvenc`
 * accepts D3D11 hwframes as input directly via
 * `NV_ENC_INPUT_RESOURCE_TYPE_DIRECTX` (see HWAccelIntro § CUDA: "NVENC
 * can accept d3d11 frames context directly"). NVENC handles the
 * D3D11→encoder registration internally.
 *
 * Earlier revisions of this module emitted `-init_hw_device cuda=cu@dx`
 * to derive a CUDA device from the D3D11 device. That syntax is real,
 * but `cuda_device_derive` in `libavutil/hwcontext_cuda.c` only
 * accepts `AV_HWDEVICE_TYPE_VULKAN` as a source type — every other
 * source returns `AVERROR(ENOSYS)` at init time. The `hwmap` step
 * that depended on it (`hwmap=derive_device=cuda`) had the same
 * limitation. Both have been removed.
 *
 * Other paths (software encoders, AMF, QSV on a non-fast-path source,
 * VideoToolbox) don't require an explicit hwctx — FFmpeg opens what it
 * needs internally.
 *
 * @typedef {import("./types.js").StreamConfig} StreamConfig
 * @typedef {import("./types.js").Capabilities} Capabilities
 */

import { isVaapiCodec } from "./codecs.js";

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
	return [];
};

export { buildHwDeviceArgs, DEFAULT_VAAPI_DEVICE };
