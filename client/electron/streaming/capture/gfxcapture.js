/**
 * Pure source-filter builder for the `gfxcapture` Windows capture filter.
 *
 * `gfxcapture` always emits a D3D11 hardware frame whose underlying
 * software format is one of:
 *
 *   - `bgra`     → `AV_PIX_FMT_BGRA`     (8-bit, default)
 *   - `x2bgr10`  → `AV_PIX_FMT_X2BGR10`  (10-bit; alias `10bit`)
 *   - `rgbaf16`  → `AV_PIX_FMT_RGBAF16`  (16-bit float; alias `16bit`)
 *
 * (See the `output_fmt` AVOption table in `vsrc_gfxcapture.c`.) There is
 * no `nv12` / `p010` option — the filter does not perform RGB→YUV
 * conversion. Earlier revisions of this project requested those formats
 * and the filter errored out at init; the valid set is enforced below.
 *
 * Resize / crop / scale-mode are honoured by gfxcapture's D3D11 video
 * processor (`width`, `height`, `resize_mode`, `scale_mode`), so a
 * downstream `scale=` is only needed when the consumer requires
 * software memory.
 *
 * @typedef {import("../types.js").StreamConfig} StreamConfig
 */

import { effectiveCaptureFps } from "../numbers.js";
import { escapeFilterValue, parseElectronScreenIndex, sourceNameToCaseInsensitiveRegex } from "../strings.js";

const VALID_OUTPUT_FMTS = new Set(["bgra", "x2bgr10", "rgbaf16"]);

/**
 * @param {StreamConfig} config
 * @param {Object} [options]
 * @param {"bgra" | "x2bgr10" | "rgbaf16"} [options.outputFmt="bgra"]
 *   The D3D11 surface format gfxcapture should produce. Must be one of
 *   the three values supported by the filter. `bgra` is appropriate for
 *   SDR; `x2bgr10` for HDR10 passthrough; `rgbaf16` for HDR float
 *   processing chains.
 * @param {boolean} [options.resize=true] - Whether the gfxcapture filter
 *   should perform the resize itself. When `true` (default) the filter
 *   emits `width=`/`height=`/`resize_mode=scale_aspect`, which runs on
 *   the **D3D11 video processor (3D engine)** and outputs at the
 *   configured size. Set to `false` only when no downstream resize is
 *   required.
 * @returns {string}
 */
const buildSourceFilter = (config, { outputFmt = "bgra", resize = true } = {}) => {
	if (!VALID_OUTPUT_FMTS.has(outputFmt)) {
		throw new Error(`gfxcapture output_fmt must be one of ${[...VALID_OUTPUT_FMTS].join(", ")}; got "${outputFmt}". The filter does not produce NV12/P010.`);
	}

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

	options.push(`output_fmt=${outputFmt}`);
	return `gfxcapture=${options.join(":")}`;
};

export { buildSourceFilter, VALID_OUTPUT_FMTS };
