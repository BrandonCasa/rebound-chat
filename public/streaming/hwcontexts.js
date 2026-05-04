/**
 * Pure builder for the `-init_hw_device` / `-filter_hw_device` argv that
 * sets up D3D11 and (when NVENC is the encoder) a derived CUDA device.
 *
 * Required for:
 *   - hwmap from D3D11 to CUDA (the fast path)
 *   - scale_cuda / fps on CUDA hwframes
 *
 * Skipped on non-Windows hosts and when the encoder is not NVENC, since
 * the legacy CPU chain doesn't need any hardware device contexts.
 *
 * @typedef {import("./types.js").StreamConfig} StreamConfig
 * @typedef {import("./types.js").Capabilities} Capabilities
 */

import { isNvencCodec } from "./codecs.js";
import { usesGfxCapture } from "./capture/index.js";

/**
 * @param {StreamConfig} config
 * @param {Capabilities} capabilities
 * @returns {string[]}
 */
const buildHwDeviceArgs = (config, capabilities) => {
	const onWindows = capabilities.platform === "win32";
	if (!onWindows) return [];

	const wantsCudaPath =
		isNvencCodec(config.videoCodec) && capabilities.supportsHwmapCudaFromD3D11 && !config.convertStreamToSdr && usesGfxCapture(config, capabilities.platform);

	if (!wantsCudaPath) return [];

	return ["-init_hw_device", "d3d11va=dx", "-init_hw_device", "cuda=cu@dx", "-filter_hw_device", "cu"];
};

export { buildHwDeviceArgs };
