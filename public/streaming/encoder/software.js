/**
 * Pure argv builder for software encoders (libx264, libx265, libsvtav1,
 * libaom-av1, libvpx-vp9).
 *
 * @typedef {import("../types.js").StreamConfig} StreamConfig
 */

import { isAv1Codec, isHevcCodec, isVp9Codec, parseBitrateToBps } from "../codecs.js";
import { normalizeEncoderPreset } from "../presets.js";

/**
 * @param {StreamConfig} config
 * @returns {string[]}
 */
const buildArgs = (config) => {
	const args = [];
	const videoCodec = config.videoCodec;
	const gopSize = String(config.gopSize);
	const preset = normalizeEncoderPreset(videoCodec, config.encoderPreset);

	args.push("-c:v", videoCodec);

	if (isHevcCodec(videoCodec)) args.push("-tag:v", "hvc1");
	else if (isAv1Codec(videoCodec)) args.push("-tag:v", "av01");
	else if (isVp9Codec(videoCodec)) args.push("-tag:v", "vp09");

	if (videoCodec === "libx265") {
		args.push("-x265-params", `repeat-headers=1:keyint=${gopSize}:min-keyint=${gopSize}:scenecut=0`);
	} else if (videoCodec === "libx264") {
		args.push("-x264-params", `keyint=${gopSize}:min-keyint=${gopSize}:scenecut=0`);
	} else if (videoCodec === "libsvtav1") {
		args.push("-g", gopSize, "-svtav1-params", `keyint=${gopSize}:scd=0`);
	} else if (videoCodec === "libaom-av1") {
		args.push("-g", gopSize, "-keyint_min", gopSize, "-cpu-used", preset);
	} else if (videoCodec === "libvpx-vp9") {
		args.push("-g", gopSize, "-keyint_min", gopSize, "-deadline", "realtime", "-cpu-used", preset, "-row-mt", "1", "-lag-in-frames", "0");
	}

	if (videoCodec === "libvpx-vp9") {
		args.push("-pix_fmt", "yuv420p");
	}

	args.push("-b:v", config.videoBitrate, "-maxrate", config.videoBitrate, "-bufsize", String(parseBitrateToBps(config.videoBitrate) * 2));

	if (videoCodec !== "libvpx-vp9") {
		args.push("-preset", preset);
	}

	return args;
};

export { buildArgs };
