/**
 * Pure capture-input argv builder for macOS avfoundation.
 *
 * @typedef {import("../types.js").StreamConfig} StreamConfig
 */

import { effectiveCaptureFps } from "../numbers.js";

/**
 * @param {StreamConfig} config
 * @returns {string[]}
 */
const buildInputArgs = (config) => {
	const args = ["-thread_queue_size", "1024"];
	if (config.rtbufsize) args.push("-rtbufsize", config.rtbufsize);
	args.push("-f", "avfoundation", "-framerate", String(effectiveCaptureFps(config)), "-capture_cursor", config.drawMouse ? "1" : "0", "-i", "1:none");
	return args;
};

export { buildInputArgs };
