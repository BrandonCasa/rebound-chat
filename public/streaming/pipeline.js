/**
 * Composes capture + filter + encoder + output pieces into a final FFmpeg argv.
 *
 * Pure: no I/O, no logging, no `this`. The caller is responsible for spawning
 * the process and reacting to exit codes.
 *
 * `buildArgs(config, capabilities)` returns the argv ready to spawn.
 *
 * `fallbackOnFailure(capabilities)` returns a Capabilities object with the
 * NVENC fast path disabled, used by the caller if the first attempt exits
 * non-zero quickly.
 *
 * @typedef {import("./types.js").StreamConfig} StreamConfig
 * @typedef {import("./types.js").Capabilities} Capabilities
 */

import { selectEncoder } from "./encoder/index.js";
import { selectVideoFilter } from "./filters/videoFilter.js";
import { selectInputBackend, usesGfxCapture } from "./capture/index.js";
import { buildHwDeviceArgs } from "./hwcontexts.js";
import * as hls from "./output/hls.js";

/**
 * @param {NodeJS.Platform} [platform]
 * @returns {Capabilities}
 */
const defaultCapabilities = (platform = process.platform) => ({
	platform,
	supportsHwmapCudaFromD3D11: platform === "win32",
});

/**
 * Disable the fast path. Used after a one-shot CUDA derivation failure.
 *
 * @param {Capabilities} capabilities
 * @returns {Capabilities}
 */
const fallbackOnFailure = (capabilities) => ({
	...capabilities,
	supportsHwmapCudaFromD3D11: false,
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
	return ["-thread_queue_size", "1024", ...config.audioInputArgs];
};

/**
 * @param {StreamConfig} config
 * @returns {string[]}
 */
const buildAudioCodecArgs = (config) => {
	if (!config.audioInputArgs?.length && !config.mapSourceAudio) return [];
	const args = ["-c:a", config.audioCodec, "-b:a", config.audioBitrate];
	if (config.audioCodec === "aac") {
		args.push("-ac", "2", "-ar", "48000");
	}
	return args;
};

/**
 * Compose the full argv (without the binary path).
 *
 * @param {StreamConfig} config
 * @param {Capabilities} [capabilities]
 * @returns {{ command: string, args: string[], usedFastPath: boolean }}
 */
const buildArgs = (config, capabilities = defaultCapabilities()) => {
	const argv = ["-y"];
	const usingGfxCapture = usesGfxCapture(config, capabilities.platform);

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
		} else if (config.mapSourceAudio) {
			argv.push("-map", "0:a?");
		}
		if (videoFilter) {
			argv.push("-vf", videoFilter);
		}
	}

	const encoder = selectEncoder(config.videoCodec);
	argv.push(...encoder.buildArgs(config));

	argv.push(...buildAudioCodecArgs(config));

	argv.push(...hls.buildArgs(config));

	const onWindows = capabilities.platform === "win32";
	const isNvencFastPath = onWindows && usingGfxCapture && capabilities.supportsHwmapCudaFromD3D11 && /_nvenc$/.test(config.videoCodec);

	return {
		command: config.ffmpegPath,
		args: argv,
		usedFastPath: isNvencFastPath,
	};
};

export { buildArgs, defaultCapabilities, fallbackOnFailure };
