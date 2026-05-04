/**
 * Pure source-filter builder for the legacy gfxcapture chain.
 *
 * Produces a `gfxcapture=...:output_fmt=bgra` source. The caller is
 * expected to follow it with `hwdownload` + `format=bgra` and any CPU
 * filters required (scale, fps, format=yuv420p).
 *
 * @typedef {import("../types.js").StreamConfig} StreamConfig
 */

import { escapeFilterValue, parseElectronScreenIndex, sourceNameToCaseInsensitiveRegex } from "../strings.js";

/**
 * @param {StreamConfig} config
 * @param {Object} [options]
 * @param {string} [options.outputFmt] - "bgra" by default; "nv12" for the CUDA path.
 * @returns {string}
 */
const buildSourceFilter = (config, { outputFmt = "bgra" } = {}) => {
	const sourceName = config.source?.name || "";
	const sourceId = config.source?.id || "";
	const options = [];

	if (sourceId.startsWith("screen:")) {
		options.push(`monitor_idx=${parseElectronScreenIndex(sourceId)}`);
	} else {
		options.push(`window_title='${escapeFilterValue(sourceNameToCaseInsensitiveRegex(sourceName))}'`);
	}

	options.push(`max_framerate=${config.captureFps}`);
	options.push(`capture_cursor=${config.drawMouse ? "1" : "0"}`);

	if (config.outputWidth && config.outputHeight) {
		options.push(`width=${config.outputWidth}`);
		options.push(`height=${config.outputHeight}`);
		options.push("resize_mode=scale_aspect");
	}

	options.push(`output_fmt=${outputFmt}`);
	return `gfxcapture=${options.join(":")}`;
};

export { buildSourceFilter };
