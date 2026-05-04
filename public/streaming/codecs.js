/**
 * Pure helpers for classifying video/audio codecs and parsing bitrates.
 *
 * These are shared across encoder/capture/output modules. No I/O, no state.
 */

const NVENC_CODECS = new Set(["h264_nvenc", "hevc_nvenc", "av1_nvenc"]);
const SOFTWARE_VIDEO_CODECS = new Set(["libx264", "libx265", "libaom-av1", "libsvtav1"]);
const QSV_VIDEO_CODECS = new Set(["h264_qsv", "hevc_qsv", "av1_qsv", "vp9_qsv"]);
const VIDEOTOOLBOX_VIDEO_CODECS = new Set(["h264_videotoolbox", "hevc_videotoolbox"]);
const HEVC_VIDEO_CODECS = new Set(["libx265", "hevc_nvenc", "hevc_qsv", "hevc_videotoolbox"]);
const H264_VIDEO_CODECS = new Set(["libx264", "h264_nvenc", "h264_qsv", "h264_videotoolbox"]);
const AV1_VIDEO_CODECS = new Set(["av1_nvenc", "av1_qsv", "libaom-av1", "libsvtav1"]);
const VP9_VIDEO_CODECS = new Set(["libvpx-vp9", "vp9_qsv"]);

const lower = (value) =>
	String(value || "")
		.trim()
		.toLowerCase();

const isNvencCodec = (videoCodec) => NVENC_CODECS.has(lower(videoCodec));
const isSoftwareCodec = (videoCodec) => SOFTWARE_VIDEO_CODECS.has(lower(videoCodec));
const isQsvCodec = (videoCodec) => QSV_VIDEO_CODECS.has(lower(videoCodec));
const isVideotoolboxCodec = (videoCodec) => VIDEOTOOLBOX_VIDEO_CODECS.has(lower(videoCodec));
const isHevcCodec = (videoCodec) => HEVC_VIDEO_CODECS.has(lower(videoCodec));
const isH264Codec = (videoCodec) => H264_VIDEO_CODECS.has(lower(videoCodec));
const isAv1Codec = (videoCodec) => AV1_VIDEO_CODECS.has(lower(videoCodec));
const isVp9Codec = (videoCodec) => VP9_VIDEO_CODECS.has(lower(videoCodec));

const codecFamily = (videoCodec) => {
	const codec = lower(videoCodec);
	if (NVENC_CODECS.has(codec)) return "nvenc";
	if (codec === "libsvtav1") return "svt_av1";
	if (codec === "libaom-av1") return "libaom_av1";
	if (codec === "libvpx-vp9") return "libvpx_vp9";
	if (SOFTWARE_VIDEO_CODECS.has(codec)) return "software";
	if (QSV_VIDEO_CODECS.has(codec)) return "qsv";
	if (VIDEOTOOLBOX_VIDEO_CODECS.has(codec)) return "videotoolbox";
	throw new Error(`Unknown video codec: ${videoCodec}`);
};

const parseBitrateToBps = (value) => {
	const text = lower(value);
	if (text.endsWith("k")) return Math.round(Number.parseFloat(text.slice(0, -1)) * 1000);
	if (text.endsWith("m")) return Math.round(Number.parseFloat(text.slice(0, -1)) * 1_000_000);
	const parsed = Number.parseInt(text, 10);
	if (!Number.isFinite(parsed) || parsed <= 0) {
		throw new Error("Bitrate must be a positive number, or use k/m suffixes.");
	}
	return parsed;
};

const codecString = (videoCodec, audioCodec, includeAudio) => {
	const codecs = [];
	const normalizedVideo = lower(videoCodec);
	const normalizedAudio = lower(audioCodec);

	if (HEVC_VIDEO_CODECS.has(normalizedVideo)) codecs.push("hvc1");
	else if (H264_VIDEO_CODECS.has(normalizedVideo)) codecs.push("avc1");
	else if (AV1_VIDEO_CODECS.has(normalizedVideo)) codecs.push("av01");
	else if (VP9_VIDEO_CODECS.has(normalizedVideo)) codecs.push("vp09");

	if (includeAudio && normalizedAudio === "aac") codecs.push("mp4a.40.2");
	else if (includeAudio && normalizedAudio === "libmp3lame") codecs.push("mp4a.40.34");

	return codecs.join(",");
};

export {
	NVENC_CODECS,
	SOFTWARE_VIDEO_CODECS,
	QSV_VIDEO_CODECS,
	VIDEOTOOLBOX_VIDEO_CODECS,
	HEVC_VIDEO_CODECS,
	H264_VIDEO_CODECS,
	AV1_VIDEO_CODECS,
	VP9_VIDEO_CODECS,
	lower,
	isNvencCodec,
	isSoftwareCodec,
	isQsvCodec,
	isVideotoolboxCodec,
	isHevcCodec,
	isH264Codec,
	isAv1Codec,
	isVp9Codec,
	codecFamily,
	parseBitrateToBps,
	codecString,
};
