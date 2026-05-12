/**
 * Composes capture + filter + encoder + output pieces into a final FFmpeg argv.
 *
 * Pure: no I/O, no logging, no `this`. The caller is responsible for spawning
 * the process and reacting to exit codes.
 *
 * `buildArgs(config, capabilities)` returns the argv ready to spawn.
 *
 * @typedef {import("./types.js").StreamConfig} StreamConfig
 * @typedef {import("./types.js").Capabilities} Capabilities
 */

import { selectEncoder } from "./encoder/index.js";
import { selectVideoFilter } from "./filters/videoFilter.js";
import { selectInputBackend, usesGfxCapture } from "./capture/index.js";
import { buildHwDeviceArgs } from "./hwcontexts.js";
import * as hls from "./output/hls.js";
import * as whip from "./output/whip.js";

const outputBuilders = {
	hls,
	whip,
};

/**
 * @param {NodeJS.Platform} [platform]
 * @returns {Capabilities}
 */
const defaultCapabilities = (platform = process.platform) => ({
	platform,
});

/**
 * @param {StreamConfig} config
 * @param {Capabilities} capabilities
 * @returns {string[]}
 */
const buildCaptureArgs = (config, capabilities) => {
	if (config.manualInputArgs?.length) {
		return [...config.manualInputArgs];
	}

	if (usesGfxCapture(config, capabilities.platform)) {
		return [];
	}

	const backend = selectInputBackend(config, capabilities.platform);
	return backend.buildInputArgs(config);
};

/**
 * @param {StreamConfig} config
 * @returns {string[]}
 */
const buildAudioInputArgs = (config) => {
	if (!config.audioInputArgs?.length) return [];
	const prefix = ["-thread_queue_size", "1024"];
	if (config.rtbufsize) prefix.push("-rtbufsize", config.rtbufsize);
	return [...prefix, ...config.audioInputArgs];
};

/**
 * Pin the output to a constant frame rate using the configured stream FPS
 * (falling back to capture FPS). Pairing `-fps_mode cfr` with `-r` makes
 * HLS segment durations predictable and prevents drift when the upstream
 * source is variable (desktop capture only emits frames on screen change).
 *
 * @param {StreamConfig} config
 * @returns {string[]}
 */
const buildCfrOutputArgs = (config) => {
	const fps = config.fps || config.captureFps;
	if (!fps) return [];
	return ["-fps_mode", "cfr", "-r", String(fps)];
};

/**
 * Whether this config produces any audio in the final output. File
 * sources auto-pull `0:a?` from input 0 so the file's audio track makes
 * it into the HLS muxer; desktop sources only have audio when the user
 * provided an explicit `audioInputArgs` slice or asked for
 * `mapSourceAudio` (rare — desktop demuxers don't typically expose
 * audio streams).
 *
 * @param {StreamConfig} config
 * @returns {boolean}
 */
const hasAudioOutput = (config) => Boolean(config.audioInputArgs?.length || config.mapSourceAudio || config.sourceMode === "file");

/**
 * @param {StreamConfig} config
 * @returns {string[]}
 */
const buildAudioCodecArgs = (config) => {
	if (!hasAudioOutput(config)) return [];
	const args = ["-c:a", config.audioCodec, "-b:a", config.audioBitrate];
	if (config.audioCodec === "aac") {
		args.push("-ac", "2", "-ar", "48000");
	} else if (config.audioCodec === "opus" || config.audioCodec === "libopus") {
		args.push("-ac", "2", "-ar", "48000");
	}
	return args;
};

const buildOutputArgs = (config, options) => {
	const output = options.output || { type: "hls", options: options.respawn || {} };
	const type = output.type || "hls";
	const builder = outputBuilders[type];
	if (!builder) {
		throw new TypeError(`Unsupported streaming output type: ${type}`);
	}
	const outputOptions = type === "hls" ? output.options || options.respawn || {} : output.options || {};
	return builder.buildArgs(config, outputOptions);
};

/**
 * Compose the full argv (without the binary path).
 *
 * `respawn` is supplied by the streamer manager when relaunching FFmpeg
 * mid-stream (server-driven adaptation, manual restart, etc.). It
 * forwards `discontStart` + `startNumber` to the HLS muxer so the
 * resulting playlist continues from the previous generation's media
 * sequence with an `#EXT-X-DISCONTINUITY` tag at the join.
 *
 * @param {StreamConfig} config
 * @param {Capabilities} [capabilities]
 * @param {{
 *   respawn?: { discontStart?: boolean, startNumber?: number },
 *   output?: { type?: "hls"|"whip", options?: Record<string, unknown> }
 * }} [options]
 * @returns {{ command: string, args: string[] }}
 */
const buildArgs = (config, capabilities = defaultCapabilities(), options = {}) => {
	const argv = ["-y"];
	const usingGfxCapture = usesGfxCapture(config, capabilities.platform);
	const hasFileSource = config.sourceMode === "file";

	argv.push(...buildHwDeviceArgs(config, capabilities));

	const captureArgs = buildCaptureArgs(config, capabilities);
	if (captureArgs.length) argv.push(...captureArgs);

	const audioInputArgs = buildAudioInputArgs(config);
	if (audioInputArgs.length) argv.push(...audioInputArgs);

	const videoFilter = selectVideoFilter(config, capabilities);

	if (usingGfxCapture) {
		argv.push("-filter_complex", `${videoFilter}[v]`);
		argv.push("-map", "[v]");
		if (config.audioInputArgs?.length) {
			argv.push("-map", "0:a:0");
		}
	} else {
		argv.push("-map", "0:v:0");
		if (config.audioInputArgs?.length) {
			argv.push("-map", "1:a:0");
		} else if (config.mapSourceAudio || hasFileSource) {
			// `?` so a desktop source whose demuxer doesn't expose audio (or a
			// file with no audio track) doesn't crash FFmpeg's mapper.
			argv.push("-map", "0:a?");
		}
		if (videoFilter) {
			argv.push("-vf", videoFilter);
		}
	}

	const encoder = selectEncoder(config.videoCodec);
	argv.push(...encoder.buildArgs(config));

	argv.push(...buildAudioCodecArgs(config));

	argv.push(...buildCfrOutputArgs(config));

	argv.push(...buildOutputArgs(config, options));

	return {
		command: config.ffmpegPath,
		args: argv,
	};
};

export { buildArgs, defaultCapabilities };
