/**
 * Selects the per-family encoder argv builder for a given codec.
 *
 * @typedef {import("../types.js").StreamConfig} StreamConfig
 * @typedef {import("../types.js").ArgBuilder} ArgBuilder
 */

import { codecFamily } from "../codecs.js";
import * as nvenc from "./nvenc.js";
import * as amf from "./amf.js";
import * as qsv from "./qsv.js";
import * as vaapi from "./vaapi.js";
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
		case "amf":
			return amf;
		case "qsv":
			return qsv;
		case "vaapi":
			return vaapi;
		case "videotoolbox":
			return videotoolbox;
		case "software":
		case "svt_av1":
		case "libaom_av1":
		case "libvpx_vp9":
		case "rav1e":
		case "vvenc":
		case "openh264":
		case "kvazaar":
			return software;
		default:
			throw new Error(`No encoder builder registered for family ${family}`);
	}
};

export { selectEncoder };
