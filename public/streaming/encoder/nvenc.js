/**
 * Pure argv builder for NVENC encoders (h264_nvenc, hevc_nvenc, av1_nvenc).
 *
 * Returns the slice of argv that starts with `-c:v` and ends just before
 * the audio codec args.
 *
 * @typedef {import("../types.js").StreamConfig} StreamConfig
 */

import { isAv1Codec, isHevcCodec, isVp9Codec, parseBitrateToBps } from "../codecs.js";
import { normalizeNvencPreset } from "../presets.js";

/**
 * @param {StreamConfig} config
 * @returns {string[]}
 */
const buildArgs = (config) => {
	const args = [];
	const videoCodec = config.videoCodec;
	const gopSize = String(config.gopSize);
	const preset = normalizeNvencPreset(config.encoderPreset);

	args.push("-c:v", videoCodec);

	if (isHevcCodec(videoCodec)) args.push("-tag:v", "hvc1");
	else if (isAv1Codec(videoCodec)) args.push("-tag:v", "av01");
	else if (isVp9Codec(videoCodec)) args.push("-tag:v", "vp09");

	args.push("-g", gopSize, "-keyint_min", gopSize, "-sc_threshold", "0");

	args.push("-b:v", config.videoBitrate, "-maxrate", config.videoBitrate, "-bufsize", String(parseBitrateToBps(config.videoBitrate) * 2));

	args.push("-preset", preset, "-tune", config.nvencTune);
	if (config.nvencMultipass !== "disabled") args.push("-multipass", config.nvencMultipass);
	args.push("-rc", config.nvencRc);
	args.push("-spatial_aq", config.nvencSpatialAq ? "1" : "0");
	args.push("-temporal_aq", config.nvencTemporalAq ? "1" : "0");
	if (config.nvencCq !== null && ["vbr", "constqp"].includes(config.nvencRc)) {
		args.push("-cq", String(config.nvencCq));
	}
	args.push("-b_ref_mode", config.nvencBRefMode === "disabled" ? "disabled" : config.nvencBRefMode);
	if (config.nvencBFrames !== null) args.push("-bf", String(config.nvencBFrames));
	if (config.nvencLookahead !== null && config.nvencLookahead > 0) {
		args.push("-rc-lookahead", String(config.nvencLookahead));
	}

	return args;
};

export { buildArgs };
