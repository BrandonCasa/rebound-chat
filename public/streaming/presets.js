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
	software: SOFTWARE_PRESETS,
	svt_av1: SVT_AV1_PRESETS,
	libaom_av1: LIBAOM_AV1_PRESETS,
	libvpx_vp9: LIBVPX_VP9_PRESETS,
	qsv: QSV_PRESETS,
	videotoolbox: VIDEOTOOLBOX_PRESETS,
};

const DEFAULT_ENCODER_PRESETS = {
	nvenc: "p6",
	software: "medium",
	svt_av1: "8",
	libaom_av1: "6",
	libvpx_vp9: "5",
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
