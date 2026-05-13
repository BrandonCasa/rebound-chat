/**
 * Pure argv builder for NVENC encoders (h264_nvenc, hevc_nvenc, av1_nvenc).
 *
 * Returns the slice of argv that starts with `-c:v` and ends just before
 * the audio codec args.
 *
 * @typedef {import("../types.js").StreamConfig} StreamConfig
 */

import { isAv1Codec, isHevcCodec, isVp9Codec } from "../codecs.js";
import { normalizeNvencPreset } from "../presets.js";
import { computeVbvBufsize } from "./_vbv.js";

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

	args.push(
		"-b:v",
		config.videoBitrate,
		"-maxrate",
		config.videoBitrate,
		"-bufsize",
		String(computeVbvBufsize(config.videoBitrate, config.vbvMultiplier ?? 1.0))
	);

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
		// Signal HDR10 colour space so the container and players treat
		// this stream as HDR. gfxcapture captures at full 10-bit
		// precision (X2BGR10 D3D11 hwframe); NVENC accepts that frame
		// directly via NV_ENC_INPUT_RESOURCE_TYPE_DIRECTX and the HEVC
		// wrapper auto-forces MAIN10 when input is 10-bit (see the
		// IS_10BIT(...) check in libavcodec/nvenc_hevc.c). HEVC or AV1
		// is strongly recommended for HDR passthrough; H.264 does not
		// carry HDR10 metadata in a standardised way.
		args.push("-color_primaries", "bt2020");
		args.push("-color_trc", "smpte2084");
		args.push("-colorspace", "bt2020nc");
		// Pin the profile explicitly for HEVC. NVENC would auto-set it
		// anyway, but this surfaces a clear error early if the upstream
		// chain ever degrades to 8-bit by accident.
		if (isHevcCodec(videoCodec)) args.push("-profile:v", "main10");
	} else if (config.hdrMode === "convert") {
		// The HDR→SDR tonemap is performed in the filter graph by
		// `zscale ... tonemap=hable ... format=yuv420p` (CPU). Declare
		// the resulting BT.709 colour space explicitly so players don't
		// try to interpret the SDR output as HDR.
		args.push("-color_primaries", "bt709");
		args.push("-color_trc", "bt709");
		args.push("-colorspace", "bt709");
	}

	return args;
};

export { buildArgs };
