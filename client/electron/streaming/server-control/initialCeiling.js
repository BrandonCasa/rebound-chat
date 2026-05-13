/**
 * Capture the streamer's ceiling at the moment a stream starts.
 *
 * The ceiling is the user's intent: "even if every viewer has fibre and
 * a beefy decoder, do not exceed *this* quality." Server-driven
 * adaptation is allowed to clamp downwards from here, never upwards.
 *
 * The adapter consumes this object (alongside the current settings and
 * a server recommendation) on every push.
 */

import { parseBitrateToBps } from "../codecs.js";

/**
 * @param {import("../types.js").StreamConfig} config
 * @returns {import("../../../shared/streaming/types.js").InitialCeiling}
 */
const buildInitialCeiling = (config) => {
	const videoBitrate = parseBitrateToBps(config.videoBitrate);
	return {
		videoBitrate,
		videoCodec: String(config.videoCodec || ""),
		outputWidth: config.outputWidth ?? null,
		outputHeight: config.outputHeight ?? null,
		fps: config.fps ?? null,
		createdAt: Date.now(),
	};
};

export { buildInitialCeiling };
