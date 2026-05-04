/**
 * Pure argv builder for VAAPI encoders (h264_vaapi, hevc_vaapi, av1_vaapi, vp9_vaapi).
 *
 * VAAPI requires a VA-API device to be opened. The caller is responsible for
 * adding `-vaapi_device /dev/dri/renderD128` (or equivalent) before the input
 * via `manualInputArgs` if the default device is not `/dev/dri/renderD128`.
 * This builder emits the encode-side args only; the upload filter
 * (`format=nv12,hwupload`) is prepended to the `-vf` filter chain automatically
 * by {@link selectVideoFilter} when it detects a VAAPI codec.
 *
 * Linux only — VAAPI is not available on Windows or macOS.
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

	args.push("-g", gopSize, "-keyint_min", gopSize);

	args.push("-b:v", config.videoBitrate, "-maxrate", config.videoBitrate, "-bufsize", String(parseBitrateToBps(config.videoBitrate) * 2));

	return args;
};

export { buildArgs };
