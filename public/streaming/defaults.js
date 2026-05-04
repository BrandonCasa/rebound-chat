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

const websiteBaseUrlDefault = () => (!process?.env?.NODE_ENV || process?.env?.NODE_ENV === "development" ? "http://localhost:6001" : "https://rebound.nexus");

/**
 * Build a fresh DEFAULT_SETTINGS object. The profile-derived fields are
 * resolved at call time so `buildDefaultSettings({ profile })` can be used
 * by callers (e.g. tests) that want a different host's defaults.
 *
 * @param {{ profile?: import("./platform/profiles.js").PlatformProfile }} [options]
 */
const buildDefaultSettings = (options = {}) => {
	const profile = options.profile || currentPlatformProfile();
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
		fps: 30,
		encoderPreset: profile.defaults.encoderPreset,
		nvencTune: "ull",
		nvencMultipass: "fullres",
		nvencRc: "vbr",
		nvencCq: 23,
		nvencSpatialAq: true,
		nvencTemporalAq: true,
		nvencBRefMode: "middle",
		nvencBFrames: 3,
		nvencLookahead: 16,
		gopSize: 60,
		hlsTime: "2",
		hlsListSize: 6,
		convertStreamToSdr: false,
		openSharePage: true,
	};
};

const DEFAULT_SETTINGS = buildDefaultSettings();

const activeProfile = currentPlatformProfile();
const CAPTURE_BACKEND_OPTIONS = activeProfile.captureBackends;
const VIDEO_CODEC_OPTIONS = activeProfile.videoCodecs;
const AUDIO_CODEC_OPTIONS = activeProfile.audioCodecs;

export { DEFAULT_SETTINGS, CAPTURE_BACKEND_OPTIONS, VIDEO_CODEC_OPTIONS, AUDIO_CODEC_OPTIONS, buildDefaultSettings };
