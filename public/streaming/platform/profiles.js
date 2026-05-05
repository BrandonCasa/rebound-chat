/**
 * Declarative catalog of what each host's bundled FFmpeg can actually do.
 *
 * Each entry describes a host boundary: for one combination of
 * platform + arch + FFmpeg flavor, which encoders/capture backends are usable.
 * Every other module (defaults, presets, normalizeConfig, the renderer dropdowns)
 * reads from these profiles instead of hard-coding lists.
 *
 * To tweak what a platform supports, edit the matching entry below — that is
 * the only place that needs to change. Adding a new build flavor (e.g. a
 * future Linux VAAPI build with GPU filters) means appending one entry.
 *
 * Keep entries ordered most-specific → least-specific.
 * `selectPlatformProfile` returns the first match.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Sources used to populate the codec lists (BtbN lgpl-shared):
 *
 *   NVENC  (50-ffnvcodec.sh)  : win64 ✓ · linux64 ✓ · linuxarm64 ✓* · winarm64 ✗
 *   AMF    (50-amf.sh)        : all platforms ✓ (runtime: AMD GPU + driver required)
 *   QSV    (50-onevpl.sh)     : win64 ✓ · linux64 ✓ · *arm64 ✗ (any arch)
 *   VAAPI  (50-vaapi/)        : linux64 ✓ only (linuxarm64 explicitly excluded)
 *   SVT-AV1(50-svtav1.sh)    : all except win32(x86) ✓ (FFmpeg ≥ 7.0)
 *   libaom (50-aom.sh)        : all except winarm64 ✓
 *   libvpx (50-libvpx.sh)     : all except winarm64 ✓
 *   rav1e  (50-rav1e.sh)      : all except win32(x86) ✓
 *   vvenc  (50-vvenc.sh)      : all except *32 ✓ (FFmpeg ≥ 7.0)
 *   openh264(50-openh264.sh)  : all platforms ✓
 *   libopus(50-libopus.sh)    : all platforms ✓
 *   libmp3lame(50-libmp3lame.sh): all platforms ✓ (LGPL 2.0)
 *   x264/x265                 : lgpl* explicitly excluded
 *
 *   * NVENC on linuxarm64: headers compile in; works only on Jetson-class ARM
 *     NVIDIA hardware at runtime.
 *
 * macOS source build (projectscripts/fetch-ffmpeg.js):
 *   Only --enable-videotoolbox --enable-audiotoolbox. No third-party libraries.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * @typedef {Object} PlatformProfile
 * @property {string} id                            -- stable identifier
 * @property {string} description                   -- human-readable summary
 * @property {(host: { platform: NodeJS.Platform, arch: string }) => boolean} match
 * @property {string[]} videoCodecs                 -- ffmpeg encoder names available in this build
 * @property {string[]} audioCodecs                 -- ffmpeg audio encoder names
 * @property {string[]} captureBackends             -- capture backend ids
 * @property {Object} defaults
 * @property {string} defaults.videoCodec
 * @property {string} defaults.audioCodec
 * @property {string} defaults.captureBackend
 * @property {string} defaults.encoderPreset
 */

// ─── macOS (both x64 and arm64) ──────────────────────────────────────────────
// Source build: --enable-videotoolbox --enable-audiotoolbox only.
// No third-party codec libs are compiled in.
const DARWIN = {
	id: "darwin-lgpl-source",
	description: "macOS LGPL source build (--enable-videotoolbox --enable-audiotoolbox only).",
	match: ({ platform }) => platform === "darwin",
	videoCodecs: ["h264_videotoolbox", "hevc_videotoolbox"],
	audioCodecs: [
		"aac",
		"aac_at", // Apple AudioToolbox AAC; higher quality than FFmpeg built-in
	],
	captureBackends: ["avfoundation"],
	defaults: {
		videoCodec: "h264_videotoolbox",
		audioCodec: "aac",
		captureBackend: "avfoundation",
		encoderPreset: "realtime",
	},
};

// ─── Windows x64 ─────────────────────────────────────────────────────────────
// BtbN lgpl-shared win64. Full HW + software encoder set.
const WIN32_X64 = {
	id: "win32-x64-btbn-lgpl-shared",
	description: "Windows x64 BtbN lgpl-shared (NVENC, AMF, QSV, SVT-AV1, libaom, libvpx, rav1e, vvenc, openh264).",
	match: ({ platform, arch }) => platform === "win32" && arch === "x64",
	videoCodecs: [
		// Hardware — NVIDIA (runtime: NVIDIA GPU + driver)
		"h264_nvenc",
		"hevc_nvenc",
		"av1_nvenc",
		// Hardware — AMD (runtime: AMD GPU + driver)
		"h264_amf",
		"hevc_amf",
		"av1_amf",
		// Hardware — Intel (runtime: Intel GPU + driver)
		"h264_qsv",
		"hevc_qsv",
		"av1_qsv",
		"vp9_qsv",
		// Software
		"libsvtav1",
		"libaom-av1",
		"libvpx-vp9",
		"librav1e",
		"libvvenc",
		"libopenh264",
	],
	audioCodecs: ["aac", "libopus", "libmp3lame"],
	captureBackends: ["gfxcapture", "gdigrab"],
	defaults: {
		videoCodec: "h264_nvenc",
		audioCodec: "aac",
		captureBackend: "gfxcapture",
		encoderPreset: "p4",
	},
};

// ─── Windows arm64 ───────────────────────────────────────────────────────────
// BtbN lgpl-shared winarm64. No NVENC, no QSV, no libaom, no libvpx.
const WIN32_ARM64 = {
	id: "win32-arm64-btbn-lgpl-shared",
	description: "Windows arm64 BtbN lgpl-shared (AMF, SVT-AV1, rav1e, vvenc, openh264; no NVENC/QSV/libaom/libvpx).",
	match: ({ platform, arch }) => platform === "win32" && arch === "arm64",
	videoCodecs: [
		// Hardware — AMD (runtime: AMD GPU + driver)
		"h264_amf",
		"hevc_amf",
		"av1_amf",
		// Software
		"libsvtav1",
		"librav1e",
		"libvvenc",
		"libopenh264",
	],
	audioCodecs: ["aac", "libopus", "libmp3lame"],
	captureBackends: ["gfxcapture", "gdigrab"],
	defaults: {
		videoCodec: "libsvtav1",
		audioCodec: "aac",
		captureBackend: "gfxcapture",
		encoderPreset: "8",
	},
};

// ─── Linux x64 ───────────────────────────────────────────────────────────────
// BtbN lgpl-shared linux64. Full HW + software encoder set.
const LINUX_X64 = {
	id: "linux-x64-btbn-lgpl-shared",
	description: "Linux x64 BtbN lgpl-shared (NVENC, AMF, QSV, VAAPI, SVT-AV1, libaom, libvpx, rav1e, vvenc, openh264).",
	match: ({ platform, arch }) => platform === "linux" && arch === "x64",
	videoCodecs: [
		// Hardware — NVIDIA (runtime: NVIDIA GPU + driver)
		"h264_nvenc",
		"hevc_nvenc",
		"av1_nvenc",
		// Hardware — AMD (runtime: AMD GPU + ROCm/AMDGPU-PRO driver)
		"h264_amf",
		"hevc_amf",
		"av1_amf",
		// Hardware — Intel / generic (runtime: VA-API compatible GPU + driver)
		"h264_vaapi",
		"hevc_vaapi",
		"av1_vaapi",
		"vp9_vaapi",
		// Hardware — Intel (runtime: Intel GPU + driver via OneVPL/libvpl)
		"h264_qsv",
		"hevc_qsv",
		"av1_qsv",
		"vp9_qsv",
		// Software
		"libsvtav1",
		"libaom-av1",
		"libvpx-vp9",
		"librav1e",
		"libvvenc",
		"libopenh264",
	],
	audioCodecs: ["aac", "libopus", "libmp3lame"],
	captureBackends: ["x11grab"],
	defaults: {
		videoCodec: "libsvtav1",
		audioCodec: "aac",
		captureBackend: "x11grab",
		encoderPreset: "8",
	},
};

// ─── Linux arm64 ─────────────────────────────────────────────────────────────
// BtbN lgpl-shared linuxarm64. No QSV, no VAAPI; NVENC headers present
// but only functional on NVIDIA Jetson / similar ARM NVIDIA hardware.
const LINUX_ARM64 = {
	id: "linux-arm64-btbn-lgpl-shared",
	description: "Linux arm64 BtbN lgpl-shared (NVENC*, AMF, SVT-AV1, libaom, libvpx, rav1e, vvenc, openh264; no QSV/VAAPI). *NVENC: Jetson only.",
	match: ({ platform, arch }) => platform === "linux" && arch === "arm64",
	videoCodecs: [
		// Hardware — NVIDIA Jetson (runtime: Jetson-class ARM hardware only)
		"h264_nvenc",
		"hevc_nvenc",
		"av1_nvenc",
		// Hardware — AMD (runtime: AMD GPU + ROCm; uncommon on arm64)
		"h264_amf",
		"hevc_amf",
		"av1_amf",
		// Software
		"libsvtav1",
		"libaom-av1",
		"libvpx-vp9",
		"librav1e",
		"libvvenc",
		"libopenh264",
	],
	audioCodecs: ["aac", "libopus", "libmp3lame"],
	captureBackends: ["x11grab"],
	defaults: {
		videoCodec: "libsvtav1",
		audioCodec: "aac",
		captureBackend: "x11grab",
		encoderPreset: "8",
	},
};

// ─── Fallback ─────────────────────────────────────────────────────────────────
// Used in tests and on unsupported platforms. Union of every other profile so
// existing test fixtures continue to validate without platform restriction.
const FALLBACK_PROFILE = {
	id: "fallback-permissive",
	description: "Permissive fallback (union of all known profiles). Used when no platform matches.",
	match: () => true,
	videoCodecs: [
		"h264_nvenc",
		"hevc_nvenc",
		"av1_nvenc",
		"h264_amf",
		"hevc_amf",
		"av1_amf",
		"h264_qsv",
		"hevc_qsv",
		"av1_qsv",
		"vp9_qsv",
		"h264_vaapi",
		"hevc_vaapi",
		"av1_vaapi",
		"vp9_vaapi",
		"h264_videotoolbox",
		"hevc_videotoolbox",
		"libx264",
		"libx265",
		"libsvtav1",
		"libaom-av1",
		"libvpx-vp9",
		"librav1e",
		"libvvenc",
		"libopenh264",
		"libkvazaar",
	],
	audioCodecs: ["aac", "aac_at", "libopus", "libmp3lame"],
	captureBackends: ["gfxcapture", "gdigrab", "avfoundation", "x11grab"],
	defaults: {
		videoCodec: "h264_nvenc",
		audioCodec: "aac",
		captureBackend: "gfxcapture",
		encoderPreset: "p4",
	},
};

const PLATFORM_PROFILES = [DARWIN, WIN32_X64, WIN32_ARM64, LINUX_X64, LINUX_ARM64];

export { DARWIN, WIN32_X64, WIN32_ARM64, LINUX_X64, LINUX_ARM64, FALLBACK_PROFILE, PLATFORM_PROFILES };
