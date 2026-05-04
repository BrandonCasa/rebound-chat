/**
 * Preset ladders and normalization for each encoder family.
 */

import { codecFamily, lower } from "./codecs.js";

const NVENC_PRESET_LADDER = ["p7", "p6", "p5", "p4", "p3", "p2", "p1"];
const SOFTWARE_PRESETS = ["ultrafast", "superfast", "veryfast", "faster", "fast", "medium", "slow", "slower", "veryslow", "placebo"];
const SVT_AV1_PRESETS = Array.from({ length: 13 }, (_value, index) => String(index));
const LIBAOM_AV1_PRESETS = Array.from({ length: 9 }, (_value, index) => String(index));
const LIBVPX_VP9_PRESETS = Array.from({ length: 9 }, (_value, index) => String(index));
const QSV_PRESETS = ["veryfast", "faster", "fast", "medium", "slow", "slower", "veryslow"];
const VIDEOTOOLBOX_PRESETS = ["realtime"];
// AMF: -quality option values (speed is lowest quality, quality is highest).
const AMF_PRESETS = ["speed", "balanced", "quality"];
// VAAPI has no software-controlled preset; expose a single sentinel so
// normalizeEncoderPreset never has to special-case it.
const VAAPI_PRESETS = ["default"];
// rav1e: -speed 0 (best quality) … 10 (fastest).
const RAV1E_PRESETS = Array.from({ length: 11 }, (_value, index) => String(index));
// vvenc: -preset values (none = VVenC internal default).
const VVENC_PRESETS = ["superfast", "faster", "fast", "medium", "slow", "none"];
// openh264 has no meaningful encoder preset.
const OPENH264_PRESETS = ["default"];
// kvazaar: -preset 0 (fastest) … 9 (slowest).
const KVAZAAR_PRESETS = Array.from({ length: 10 }, (_value, index) => String(index));

const NVENC_PRESET_ALIASES = {
	slowest: "p7",
	slower: "p7",
	slow: "p6",
	medium: "p5",
	fast: "p4",
	faster: "p3",
	fastest: "p1",
	hq: "p6",
	ll: "p4",
	ull: "p3",
	lossless: "p7",
};

const ENCODER_PRESETS = {
	nvenc: NVENC_PRESET_LADDER,
	amf: AMF_PRESETS,
	vaapi: VAAPI_PRESETS,
	software: SOFTWARE_PRESETS,
	svt_av1: SVT_AV1_PRESETS,
	libaom_av1: LIBAOM_AV1_PRESETS,
	libvpx_vp9: LIBVPX_VP9_PRESETS,
	rav1e: RAV1E_PRESETS,
	vvenc: VVENC_PRESETS,
	openh264: OPENH264_PRESETS,
	kvazaar: KVAZAAR_PRESETS,
	qsv: QSV_PRESETS,
	videotoolbox: VIDEOTOOLBOX_PRESETS,
};

const DEFAULT_ENCODER_PRESETS = {
	nvenc: "p6",
	amf: "quality",
	vaapi: "default",
	software: "medium",
	svt_av1: "8",
	libaom_av1: "6",
	libvpx_vp9: "5",
	rav1e: "6",
	vvenc: "fast",
	openh264: "default",
	kvazaar: "4",
	qsv: "medium",
	videotoolbox: "realtime",
};

const NVENC_TUNE_OPTIONS = ["hq", "ll", "ull", "lossless"];
const NVENC_MULTIPASS_OPTIONS = ["disabled", "qres", "fullres"];
const NVENC_RC_OPTIONS = ["vbr", "cbr", "constqp"];
const NVENC_B_REF_MODE_OPTIONS = ["disabled", "each", "middle"];

const normalizeChoice = (value, allowed, fallback, label) => {
	const normalized = lower(value || fallback);
	if (!allowed.includes(normalized)) {
		throw new Error(`${label} must be one of ${allowed.join(", ")}.`);
	}
	return normalized;
};

const normalizeNvencPreset = (value) => {
	const normalized = NVENC_PRESET_ALIASES[lower(value)] || lower(value || DEFAULT_ENCODER_PRESETS.nvenc);
	if (!NVENC_PRESET_LADDER.includes(normalized)) {
		throw new Error(`NVENC preset must be one of ${NVENC_PRESET_LADDER.join(", ")}.`);
	}
	return normalized;
};

const normalizeEncoderPreset = (videoCodec, value) => {
	const family = codecFamily(videoCodec);
	if (family === "nvenc") return normalizeNvencPreset(value);

	const allowed = ENCODER_PRESETS[family];
	const fallback = DEFAULT_ENCODER_PRESETS[family];
	if (!allowed) {
		throw new Error(`No preset list registered for encoder family "${family}".`);
	}
	return normalizeChoice(value, allowed, fallback, `${videoCodec} preset`);
};

export {
	NVENC_PRESET_LADDER,
	SOFTWARE_PRESETS,
	SVT_AV1_PRESETS,
	LIBAOM_AV1_PRESETS,
	LIBVPX_VP9_PRESETS,
	QSV_PRESETS,
	VIDEOTOOLBOX_PRESETS,
	AMF_PRESETS,
	VAAPI_PRESETS,
	RAV1E_PRESETS,
	VVENC_PRESETS,
	OPENH264_PRESETS,
	KVAZAAR_PRESETS,
	NVENC_PRESET_ALIASES,
	ENCODER_PRESETS,
	DEFAULT_ENCODER_PRESETS,
	NVENC_TUNE_OPTIONS,
	NVENC_MULTIPASS_OPTIONS,
	NVENC_RC_OPTIONS,
	NVENC_B_REF_MODE_OPTIONS,
	normalizeChoice,
	normalizeNvencPreset,
	normalizeEncoderPreset,
};
