/**
 * @typedef {import("../types.js").StreamConfig} StreamConfig
 */

/**
 * @param {StreamConfig} config
 * @returns {string[]}
 */
const buildInputArgs = (config) => {
	const args = ["-re"];
	if (config.fileLoop) args.push("-stream_loop", "-1");
	args.push("-i", config.filePath);
	return args;
};

export { buildInputArgs };
