/**
 * Default settings for the live-stream manager. Kept in a pure module so
 * tests can import them without booting Electron.
 *
 * Platform-sensitive fields (videoCodec, audioCodec, captureBackend,
 * encoderPreset) and the dropdown lists are sourced from the active
 * {@link import("./platform/profiles.js").PlatformProfile}. To change what's
 * available on a given host, edit the corresponding profile entry in
 * `platform/profiles.js` rather than this file.
 *
 * `ffmpegPath`/`ffprobePath` reference globals that only exist inside the
 * renderer process; they are read lazily so this module imports cleanly
 * from any environment.
 */

import { currentPlatformProfile } from "./platform/index.js";

const ffmpegPathDefault = () => (typeof window !== "undefined" && window.ffmpegPath) || "ffmpeg.exe";
const ffprobePathDefault = () => (typeof window !== "undefined" && window.ffprobePath) || "ffprobe.exe";

const getNodeEnv = () => (typeof process !== "undefined" && process?.env ? process.env.NODE_ENV : undefined);

const websiteBaseUrlDefault = () => {
	const nodeEnv = getNodeEnv();
	return !nodeEnv || nodeEnv === "development" ? "http://localhost:6001" : "https://rebound.nexus";
};

/**
 * Build a fresh DEFAULT_SETTINGS object. The profile-derived fields are
 * resolved at call time so `buildDefaultSettings({ profile })` can be used
 * by callers (e.g. tests) that want a different host's defaults.
 *
 * `fps` and `hlsTime` are accepted as inputs because the GOP size must be
 * `fps * hlsTime` to align IDR frames with HLS segment boundaries. Without
 * that alignment players have to wait for the next IDR after seeking, which
 * adds visible latency on segment-boundary joins.
 *
 * The NVENC defaults form a coherent low-latency profile (see
 * `profiles/lowLatency.js` for the documented rationale): `tune ull` is
 * paired with disabled multipass, zero B-frames, zero lookahead, disabled
 * B-frame referencing, and temporal-AQ off. Each of those flags would
 * otherwise contradict the ULL tune by holding frames in the encoder.
 *
 * @param {{
 *   profile?: import("./platform/profiles.js").PlatformProfile,
 *   fps?: number,
 *   hlsTime?: number | string,
 * }} [options]
 */
const buildDefaultSettings = (options = {}) => {
	const profile = options.profile || currentPlatformProfile();
	const fps = options.fps ?? 30;
	const hlsTimeNumber = Number(options.hlsTime ?? "2");
	const gopSize = fps * hlsTimeNumber;
	return {
		websiteBaseUrl: websiteBaseUrlDefault(),
		liveCreateToken: "",
		authToken: "",
		sessionLabel: "",
		retainSegmentCount: 5,
		ffmpegPath: ffmpegPathDefault(),
		ffprobePath: ffprobePathDefault(),
		source: null,
		captureBackend: profile.defaults.captureBackend,
		captureFps: 30,
		rtbufsize: "256M",
		manualInputArgs: "",
		audioInputArgs: "",
		mapSourceAudio: false,
		drawMouse: true,
		videoCodec: profile.defaults.videoCodec,
		audioCodec: profile.defaults.audioCodec,
		outputWidth: 1920,
		outputHeight: 1080,
		videoBitrate: "8M",
		audioBitrate: "160k",
		fps,
		encoderPreset: profile.defaults.encoderPreset,
		nvencTune: "ull",
		nvencMultipass: "disabled",
		nvencRc: "vbr",
		nvencCq: 23,
		nvencSpatialAq: true,
		nvencTemporalAq: false,
		nvencBRefMode: "disabled",
		nvencBFrames: 0,
		nvencLookahead: 0,
		gopSize,
		vbvMultiplier: 1.0,
		hlsTime: String(options.hlsTime ?? "2"),
		hlsListSize: 6,
		hdrMode: "off",
		openSharePage: true,
	};
};

const DEFAULT_SETTINGS = buildDefaultSettings();

const activeProfile = currentPlatformProfile();
const CAPTURE_BACKEND_OPTIONS = activeProfile.captureBackends;
const VIDEO_CODEC_OPTIONS = activeProfile.videoCodecs;
const AUDIO_CODEC_OPTIONS = activeProfile.audioCodecs;

export { DEFAULT_SETTINGS, CAPTURE_BACKEND_OPTIONS, VIDEO_CODEC_OPTIONS, AUDIO_CODEC_OPTIONS, buildDefaultSettings };
