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
 * `ffmpegPath`/`ffprobePath` are intentionally NOT defaulted here. The
 * Electron main process is the only thing that runs FFmpeg, and it
 * resolves the bundled binary via `resolveFfBinary()` in `electron.js`
 * and injects it into `StreamConfig.ffmpegPath` during
 * `ElectronLiveStreamManager.normalizeConfig`. Letting these leak into
 * persisted user settings would re-introduce the user-configurable path
 * we explicitly removed.
 */

import { currentPlatformProfile } from "./platform/index.js";

// `globalThis.IN_ELECTRON_ENV` is exposed by `public/preload.js` for the
// renderer. It is never set in the main process, so we also fall back to
// `process.versions.electron`, which is present in the main process and in
// any Node-side code spawned by Electron. Without this fallback,
// `DEFAULT_SETTINGS.websiteBaseUrl` resolves to "" in the main process,
// gets persisted to `stream-settings.json`, then clobbers the renderer's
// correct value during settings hydration — causing
// `createSession` to call `fetch("/live/api/session")` and crash with
// `ERR_INVALID_URL`.
const isElectronContext = () => {
	if (globalThis?.IN_ELECTRON_ENV) return true;
	if (typeof process !== "undefined" && process.versions?.electron) return true;
	return false;
};

const websiteBaseUrlDefault = () => {
	const nodeEnv = process.env.NODE_ENV;
	if (!isElectronContext()) return "";
	if (nodeEnv === "production") return "https://rebound.nexus";
	if (!nodeEnv || nodeEnv === "development") return "http://localhost:6001";
	return "";
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
 * `captureFps` defaults to the same value as the output `fps`. The renderer
 * exposes a single "Frame rate" control that writes both fields in lock-step
 * (see `DesktopLivePage.route.jsx`); the two-field shape is preserved in the
 * pipeline because `effectiveCaptureFps()` and the gfxcapture filter graph
 * still need to reason about source vs. encoder rate independently (e.g.
 * file-mode playback inherits its source rate from the file rather than from
 * the user's chosen output rate).
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
	const fps = options.fps ?? 60;
	const hlsTimeNumber = Number(options.hlsTime ?? "2");
	const gopSize = fps * hlsTimeNumber;
	return {
		websiteBaseUrl: websiteBaseUrlDefault(),
		liveCreateToken: "",
		authToken: "",
		sessionLabel: "",
		retainSegmentCount: 5,
		sourceMode: "screen",
		filePath: "",
		fileLoop: true,
		source: null,
		captureBackend: profile.defaults.captureBackend,
		captureFps: fps,
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
