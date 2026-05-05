/**
 * Pure argv builder for AMD AMF encoders (h264_amf, hevc_amf, av1_amf).
 *
 * AMF uses `-quality` (speed / balanced / quality) rather than `-preset`.
 *
 * @typedef {import("../types.js").StreamConfig} StreamConfig
 */

import { isAv1Codec, isHevcCodec } from "../codecs.js";
import { normalizeEncoderPreset } from "../presets.js";
import { computeVbvBufsize } from "./_vbv.js";

/**
 * @param {StreamConfig} config
 * @returns {string[]}
 */
const buildArgs = (config) => {
	const args = [];
	const videoCodec = config.videoCodec;
	const gopSize = String(config.gopSize);
	const quality = normalizeEncoderPreset(videoCodec, config.encoderPreset);

	args.push("-c:v", videoCodec);

	if (isHevcCodec(videoCodec)) args.push("-tag:v", "hvc1");
	else if (isAv1Codec(videoCodec)) args.push("-tag:v", "av01");

	args.push("-g", gopSize, "-keyint_min", gopSize);

	// AMF manages its own VBV internally and treats `-bufsize` as a
	// hint rather than an authoritative cap. We still emit it (via the
	// shared helper) so `vbvMultiplier` has consistent meaning across
	// every encoder and the renderer doesn't have to special-case AMF.
	args.push(
		"-b:v",
		config.videoBitrate,
		"-maxrate",
		config.videoBitrate,
		"-bufsize",
		String(computeVbvBufsize(config.videoBitrate, config.vbvMultiplier ?? 1.0))
	);

	args.push("-quality", quality);

	return args;
};

export { buildArgs };
