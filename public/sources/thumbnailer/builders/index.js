/**
 * Platform-aware thumbnail argv builder selector.
 *
 * The router intentionally stops at "give me the argv"; spawning, lifecycle,
 * and output-handling live one level up in `snapshotPool.js`. This split
 * keeps the builders pure and trivially unit-testable: feed in an item list,
 * compare argv against an expected list.
 *
 * @typedef {import("../../types.js").ThumbnailRequest} ThumbnailRequest
 * @typedef {{ request: ThumbnailRequest, outputPath: string }} BuilderItem
 */

import * as windows from "./windows.js";
import * as darwin from "./darwin.js";
import * as linux from "./linux.js";

const BUILDERS = {
	win32: windows,
	darwin,
	linux,
};

/**
 * @param {NodeJS.Platform} [platform]
 * @returns {{ buildArgs: (items: BuilderItem[]) => string[], buildPlan: (items: BuilderItem[]) => { argv: string[], identifyFailures: (line: string) => string[] } }}
 */
const selectThumbnailBuilder = (platform = process.platform) => {
	const builder = BUILDERS[platform];
	if (!builder) {
		throw new Error(`No thumbnail builder is registered for platform "${platform}".`);
	}
	return builder;
};

export { selectThumbnailBuilder, windows, darwin, linux };
