/**
 * Platform-aware enumerator selector.
 *
 * Pure routing: looks at `process.platform` (or an explicit override for
 * tests) and returns the matching enumerator module. Adding a platform
 * means dropping in a new sibling file and one more case here.
 *
 * @typedef {import("../types.js").SourceInfo} SourceInfo
 * @typedef {import("../types.js").EnumeratorOptions} EnumeratorOptions
 */

import * as windows from "./windows.js";
import * as darwin from "./darwin.js";
import * as linux from "./linux.js";

const ENUMERATORS = {
	win32: windows,
	darwin,
	linux,
};

const FALLBACK_ENUMERATOR = {
	enumerate: async () => [],
};

/**
 * @param {NodeJS.Platform} [platform]
 * @returns {{ enumerate: (options?: EnumeratorOptions) => Promise<SourceInfo[]> }}
 */
const selectEnumerator = (platform = process.platform) => ENUMERATORS[platform] || FALLBACK_ENUMERATOR;

export { selectEnumerator, windows, darwin, linux };
