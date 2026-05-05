/**
 * Selects the capture backend implementation for the current host + config.
 *
 * Capture backends fall into two shapes:
 *   - "input" backends produce a `-f <demuxer> ... -i <source>` argv slice
 *     (gdigrab, avfoundation, x11grab). The graph picks them up as input 0.
 *   - "filter-source" backends produce a node inside `-filter_complex`
 *     (gfxcapture). They contribute zero `-i` args.
 *
 * @typedef {import("../types.js").StreamConfig} StreamConfig
 */

import * as gdigrab from "./gdigrab.js";
import * as gfxcapture from "./gfxcapture.js";
import * as avfoundation from "./avfoundation.js";
import * as x11grab from "./x11grab.js";

/**
 * Decide which backend would be used for the given config + host platform,
 * ignoring any manualInputArgs override.
 *
 * @param {StreamConfig} config
 * @param {NodeJS.Platform} platform
 * @returns {"gfxcapture" | "gdigrab" | "avfoundation" | "x11grab"}
 */
const selectBackendKind = (config, platform) => {
	if (platform === "win32") {
		return config.captureBackend === "gfxcapture" ? "gfxcapture" : "gdigrab";
	}
	if (platform === "darwin") return "avfoundation";
	return "x11grab";
};

/**
 * Whether the resolved backend produces a filter-source rather than an
 * `-i` input. Only gfxcapture does today.
 *
 * @param {StreamConfig} config
 * @param {NodeJS.Platform} platform
 * @returns {boolean}
 */
const usesGfxCapture = (config, platform) => {
	if (config.manualInputArgs?.length) return false;
	return platform === "win32" && config.captureBackend === "gfxcapture";
};

const inputBackends = {
	gdigrab,
	avfoundation,
	x11grab,
};

/**
 * @param {StreamConfig} config
 * @param {NodeJS.Platform} platform
 * @returns {{ buildInputArgs: (config: StreamConfig) => string[] }}
 */
const selectInputBackend = (config, platform) => {
	const kind = selectBackendKind(config, platform);
	if (kind === "gfxcapture") {
		throw new Error("gfxcapture is a filter-source backend; call selectFilterSource instead.");
	}
	return inputBackends[kind];
};

export { selectBackendKind, usesGfxCapture, selectInputBackend, gfxcapture };
