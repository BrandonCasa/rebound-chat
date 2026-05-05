/**
 * Pure argv builder for VAAPI encoders (h264_vaapi, hevc_vaapi, av1_vaapi, vp9_vaapi).
 *
 * VAAPI requires a VA-API device to be opened and the frames fed to the
 * encoder to live on that device. Two co-operating modules handle that:
 *
 *   - `hwcontexts.buildHwDeviceArgs` emits
 *     `-init_hw_device vaapi=va:/dev/dri/renderD128 -filter_hw_device va`
 *     (overridable via `config.vaapiDevice`).
 *   - `filters.videoFilter.buildLegacyFilter` appends `format=nv12,hwupload`
 *     to the `-vf` chain so the encoder receives VAAPI surfaces.
 *
 * This builder emits the encode-side args only.
 *
 * Linux only — VAAPI is not available on Windows or macOS.
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

	args.push("-g", gopSize, "-keyint_min", gopSize);

	// VAAPI's rate control is driver-managed and varies per backend
	// (Intel iHD vs Mesa Gallium vs AMD AMDVLK), so `-bufsize` is best
	// treated as advisory. We pass it via the shared helper anyway so
	// `vbvMultiplier` has uniform semantics — drivers that honour it
	// will tighten the VBV; ones that don't will simply ignore it.
	args.push(
		"-b:v",
		config.videoBitrate,
		"-maxrate",
		config.videoBitrate,
		"-bufsize",
		String(computeVbvBufsize(config.videoBitrate, config.vbvMultiplier ?? 1.0))
	);

	return args;
};

export { buildArgs };
