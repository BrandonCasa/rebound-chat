/**
 * Pure argv builder for Apple VideoToolbox encoders.
 *
 * @typedef {import("../types.js").StreamConfig} StreamConfig
 */

import { isAv1Codec, isHevcCodec, isVp9Codec } from "../codecs.js";
import { computeVbvBufsize } from "./_vbv.js";

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

	// VideoToolbox honours `-bufsize` loosely — its rate control is
	// driver-managed and treats the flag as advisory rather than a hard
	// cap. We still emit it (and route it through the shared helper)
	// so the configured `vbvMultiplier` has uniform meaning across all
	// encoders and the renderer doesn't need encoder-specific UI.
	args.push(
		"-b:v",
		config.videoBitrate,
		"-maxrate",
		config.videoBitrate,
		"-bufsize",
		String(computeVbvBufsize(config.videoBitrate, config.vbvMultiplier ?? 1.0))
	);

	args.push("-realtime", "1");

	return args;
};

export { buildArgs };
