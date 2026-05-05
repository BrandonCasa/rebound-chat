/**
 * Pure source-filter builder for the legacy gfxcapture chain.
 *
 * Produces a `gfxcapture=...:output_fmt=bgra` source. The caller is
 * expected to follow it with `hwdownload` + `format=bgra` and any CPU
 * filters required (scale, fps, format=yuv420p).
 *
 * @typedef {import("../types.js").StreamConfig} StreamConfig
 */

import { effectiveCaptureFps } from "../numbers.js";
import { escapeFilterValue, parseElectronScreenIndex, sourceNameToCaseInsensitiveRegex } from "../strings.js";

/**
 * @param {StreamConfig} config
 * @param {Object} [options]
 * @param {string} [options.outputFmt] - "bgra" by default; "nv12" for the CUDA path.
 * @param {boolean} [options.resize=true] - Whether the gfxcapture filter should
 *   perform the resize itself. When `true` (default) the filter emits
 *   `width=`/`height=`/`resize_mode=scale_aspect`, which runs on the **D3D11
 *   video processor (3D engine)**. Set to `false` when a downstream filter
 *   on a different engine (e.g. `scale_cuda` after `hwmap`) will handle the
 *   resize, so the work moves off the 3D engine.
 * @returns {string}
 */
const buildSourceFilter = (config, { outputFmt = "bgra", resize = true } = {}) => {
	const sourceName = config.source?.name || "";
	const sourceId = config.source?.id || "";
	const options = [];

	if (sourceId.startsWith("screen:")) {
		options.push(`monitor_idx=${parseElectronScreenIndex(sourceId)}`);
	} else {
		options.push(`window_title='${escapeFilterValue(sourceNameToCaseInsensitiveRegex(sourceName))}'`);
	}

	options.push(`max_framerate=${effectiveCaptureFps(config)}`);
	options.push(`capture_cursor=${config.drawMouse ? "1" : "0"}`);

	if (resize && config.outputWidth && config.outputHeight) {
		options.push(`width=${config.outputWidth}`);
		options.push(`height=${config.outputHeight}`);
		options.push("resize_mode=scale_aspect");
	}

	options.push(`pix_fmt=${outputFmt}`);
	return `gfxcapture=${options.join(":")}`;
};

export { buildSourceFilter };
