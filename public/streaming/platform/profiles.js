/**
 * Declarative catalog of what each host's bundled FFmpeg can actually do.
 *
 * Each profile describes a *host boundary*: for one combination of platform +
 * arch + FFmpeg flavor, which encoders/capture backends are usable. Every
 * other module (defaults, presets, normalizeConfig, the renderer dropdowns)
 * reads from these profiles instead of hard-coding lists.
 *
 * To tweak what a platform supports, edit the matching entry below — that is
 * the only place that needs to change. Adding a new build flavor (e.g. a
 * future Linux CUDA build) means appending one entry.
 *
 * Keep entries ordered most-specific → least-specific. `selectPlatformProfile`
 * returns the first match.
 *
 * @typedef {Object} PlatformProfile
 * @property {string} id                            -- stable identifier, used for telemetry / logs
 * @property {string} description                   -- human-readable summary
 * @property {(host: { platform: NodeJS.Platform, arch: string }) => boolean} match
 * @property {string[]} videoCodecs                 -- ffmpeg encoder names available in this build
 * @property {string[]} audioCodecs                 -- ffmpeg audio encoder names
 * @property {string[]} captureBackends             -- capture backend ids understood by capture/index.js
 * @property {Object} defaults
 * @property {string} defaults.videoCodec
 * @property {string} defaults.audioCodec
 * @property {string} defaults.captureBackend
 * @property {string} defaults.encoderPreset
 */

/** macOS LGPL build (videotoolbox + audiotoolbox only — see projectscripts/fetch-ffmpeg.js). */
const DARWIN_LGPL_SHARED = {
	id: "darwin-lgpl-shared",
	description: "macOS LGPL source build with --enable-videotoolbox --enable-audiotoolbox.",
	match: ({ platform }) => platform === "darwin",
	videoCodecs: ["h264_videotoolbox", "hevc_videotoolbox"],
	audioCodecs: ["aac"],
	captureBackends: ["avfoundation"],
	defaults: {
		videoCodec: "h264_videotoolbox",
		audioCodec: "aac",
		captureBackend: "avfoundation",
		encoderPreset: "realtime",
	},
};

/** Windows BtbN lgpl-shared build (NVENC + QSV + AMF + LGPL software encoders). */
const WIN32_BTBN_LGPL_SHARED = {
	id: "win32-btbn-lgpl-shared",
	description: "Windows BtbN lgpl-shared build (NVENC, QSV, libsvtav1, libaom-av1, libvpx-vp9; no libx264/libx265).",
	match: ({ platform }) => platform === "win32",
	videoCodecs: ["h264_nvenc", "hevc_nvenc", "av1_nvenc", "h264_qsv", "hevc_qsv", "av1_qsv", "vp9_qsv", "libsvtav1", "libaom-av1", "libvpx-vp9"],
	audioCodecs: ["aac"],
	captureBackends: ["gfxcapture", "gdigrab"],
	defaults: {
		videoCodec: "h264_nvenc",
		audioCodec: "aac",
		captureBackend: "gfxcapture",
		encoderPreset: "p6",
	},
};

/** Linux BtbN lgpl-shared build. Same encoder set as Windows minus QSV by default
 *  (QSV runs on Linux but is rare on dev machines; flip it on by editing this list). */
const LINUX_BTBN_LGPL_SHARED = {
	id: "linux-btbn-lgpl-shared",
	description: "Linux BtbN lgpl-shared build (NVENC + LGPL software encoders).",
	match: ({ platform }) => platform === "linux",
	videoCodecs: ["h264_nvenc", "hevc_nvenc", "av1_nvenc", "libsvtav1", "libaom-av1", "libvpx-vp9"],
	audioCodecs: ["aac"],
	captureBackends: ["x11grab"],
	defaults: {
		videoCodec: "libsvtav1",
		audioCodec: "aac",
		captureBackend: "x11grab",
		encoderPreset: "8",
	},
};

/** Permissive fallback — used in tests and non-host environments (e.g. running
 *  the test suite on a platform we haven't catalogued yet). Allows the union
 *  of every other profile so existing test fixtures continue to validate. */
const FALLBACK_PROFILE = {
	id: "fallback-permissive",
	description: "Permissive fallback profile (union of all known profiles). Used when no match is found.",
	match: () => true,
	videoCodecs: [
		"h264_nvenc",
		"hevc_nvenc",
		"av1_nvenc",
		"h264_qsv",
		"hevc_qsv",
		"av1_qsv",
		"vp9_qsv",
		"h264_videotoolbox",
		"hevc_videotoolbox",
		"libx264",
		"libx265",
		"libsvtav1",
		"libaom-av1",
		"libvpx-vp9",
	],
	audioCodecs: ["aac", "libmp3lame"],
	captureBackends: ["gfxcapture", "gdigrab", "avfoundation", "x11grab"],
	defaults: {
		videoCodec: "h264_nvenc",
		audioCodec: "aac",
		captureBackend: "gfxcapture",
		encoderPreset: "p6",
	},
};

const PLATFORM_PROFILES = [DARWIN_LGPL_SHARED, WIN32_BTBN_LGPL_SHARED, LINUX_BTBN_LGPL_SHARED];

export { DARWIN_LGPL_SHARED, WIN32_BTBN_LGPL_SHARED, LINUX_BTBN_LGPL_SHARED, FALLBACK_PROFILE, PLATFORM_PROFILES };
