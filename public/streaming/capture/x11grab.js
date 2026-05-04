/**
 * Pure capture-input argv builder for Linux x11grab.
 *
 * @typedef {import("../types.js").StreamConfig} StreamConfig
 */

/**
 * @param {StreamConfig} config
 * @returns {string[]}
 */
const buildInputArgs = (config) => {
	const args = ["-thread_queue_size", "1024"];
	args.push("-f", "x11grab", "-framerate", String(config.captureFps), "-draw_mouse", config.drawMouse ? "1" : "0", "-i", process.env.DISPLAY || ":0.0");
	return args;
};

export { buildInputArgs };
