/**
 * Pure capture-input argv builder for Windows gdigrab.
 *
 * gdigrab provides a CPU-only screen capture path on Windows. It pushes
 * BGRA frames into the FFmpeg graph as a regular input (no filtergraph
 * source).
 *
 * @typedef {import("../types.js").StreamConfig} StreamConfig
 */

import { effectiveCaptureFps } from "../numbers.js";

/**
 * @param {StreamConfig} config
 * @returns {string[]}
 */
const buildInputArgs = (config) => {
	const sourceName = config.source?.name || "desktop";
	const sourceId = config.source?.id || "";
	const args = ["-thread_queue_size", "1024"];
	if (config.rtbufsize) args.push("-rtbufsize", config.rtbufsize);
	args.push("-f", "gdigrab", "-framerate", String(effectiveCaptureFps(config)), "-draw_mouse", config.drawMouse ? "1" : "0");
	args.push("-i", sourceId.startsWith("window:") ? `title=${sourceName}` : "desktop");
	return args;
};

export { buildInputArgs };
