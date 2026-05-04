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

	if (config.hdrMode === "passthrough") {
		// Signal HDR10 colour space so the container and players treat this stream
		// as HDR. gfxcapture captures at full P010 precision; NVENC encodes
		// the 10-bit frames as-is. HEVC or AV1 is strongly recommended for HDR
		// passthrough; H.264 does not carry HDR10 metadata in a standardised way.
		args.push("-color_primaries", "bt2020");
		args.push("-color_trc", "smpte2084");
		args.push("-colorspace", "bt2020nc");
	} else if (config.hdrMode === "convert") {
		// tonemap_cuda outputs BT.709 NV12. Declare it explicitly so players
		// don't accidentally try to interpret it as HDR.
		args.push("-color_primaries", "bt709");
		args.push("-color_trc", "bt709");
		args.push("-colorspace", "bt709");
	}

	return args;
};

export { buildArgs };
