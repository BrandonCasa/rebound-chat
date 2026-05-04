/**
 * Pure argv builder for Apple VideoToolbox encoders.
 *
 * @typedef {import("../types.js").StreamConfig} StreamConfig
 */

import { isAv1Codec, isHevcCodec, isVp9Codec, parseBitrateToBps } from "../codecs.js";

/**
 * @param {StreamConfig} config
 * @returns {string[]}
 */
const buildArgs = (config) => {
	const args = [];
	const videoCodec = config.videoCodec;
	const gopSize = String(config.gopSize);

	args.push("-c:v", videoCodec);

	if (isHevcCodec(videoCodec)) args.push("-tag:v", "hvc1");
	else if (isAv1Codec(videoCodec)) args.push("-tag:v", "av01");
	else if (isVp9Codec(videoCodec)) args.push("-tag:v", "vp09");

	args.push("-g", gopSize, "-keyint_min", gopSize, "-sc_threshold", "0");

	args.push("-b:v", config.videoBitrate, "-maxrate", config.videoBitrate, "-bufsize", String(parseBitrateToBps(config.videoBitrate) * 2));

	args.push("-realtime", "1");

	return args;
};

export { buildArgs };
