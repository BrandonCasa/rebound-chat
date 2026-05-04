/**
 * Selects the per-family encoder argv builder for a given codec.
 *
 * @typedef {import("../types.js").StreamConfig} StreamConfig
 * @typedef {import("../types.js").ArgBuilder} ArgBuilder
 */

import { codecFamily } from "../codecs.js";
import * as nvenc from "./nvenc.js";
import * as qsv from "./qsv.js";
import * as videotoolbox from "./videotoolbox.js";
import * as software from "./software.js";

/**
 * @param {string} videoCodec
 * @returns {{ buildArgs: ArgBuilder }}
 */
const selectEncoder = (videoCodec) => {
	const family = codecFamily(videoCodec);
	switch (family) {
		case "nvenc":
			return nvenc;
		case "qsv":
			return qsv;
		case "videotoolbox":
			return videotoolbox;
		case "software":
		case "svt_av1":
		case "libaom_av1":
		case "libvpx_vp9":
			return software;
		default:
			throw new Error(`No encoder builder registered for family ${family}`);
	}
};

export { selectEncoder };
