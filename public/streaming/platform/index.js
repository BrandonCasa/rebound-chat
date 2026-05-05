/**
 * Selects the active {@link PlatformProfile} for a host.
 *
 * Pure: no I/O, no caching beyond a single memoized lookup of the current
 * `process.platform`/`process.arch`. Tests and the renderer can pass an
 * explicit host to bypass autodetection.
 *
 * @typedef {import("./profiles.js").PlatformProfile} PlatformProfile
 */

import { codecFamily } from "../codecs.js";
import { ENCODER_PRESETS, DEFAULT_ENCODER_PRESETS } from "../presets.js";
import { FALLBACK_PROFILE, PLATFORM_PROFILES } from "./profiles.js";

/**
 * @param {{ platform?: NodeJS.Platform, arch?: string }} [host]
 * @returns {PlatformProfile}
 */
const selectPlatformProfile = (host = {}) => {
	const probe = {
		platform: host.platform || (typeof process !== "undefined" ? process.platform : "unknown"),
		arch: host.arch || (typeof process !== "undefined" ? process.arch : "unknown"),
	};
	return PLATFORM_PROFILES.find((profile) => profile.match(probe)) || FALLBACK_PROFILE;
};

let cached = null;

/**
 * Memoized lookup for the running process. Re-evaluated only when an explicit
 * override is passed (which forces a fresh `selectPlatformProfile` call).
 *
 * @returns {PlatformProfile}
 */
const currentPlatformProfile = () => {
	if (!cached) cached = selectPlatformProfile();
	return cached;
};

/**
 * Test-only helper: forget the memoized profile so a subsequent call re-detects.
 */
const resetPlatformProfileCache = () => {
	cached = null;
};

/**
 * Encoder families that are reachable from this profile's `videoCodecs`.
 *
 * @param {PlatformProfile} profile
 * @returns {string[]}
 */
const availableEncoderFamilies = (profile) => {
	const families = new Set();
	for (const codec of profile.videoCodecs) {
		try {
			families.add(codecFamily(codec));
		} catch (_err) {
			// Codec not classifiable; ignore so a typo doesn't blow up startup.
		}
	}
	return [...families];
};

/**
 * Map of family → preset list, restricted to families this profile can use.
 * The renderer uses this to keep dropdowns honest.
 *
 * @param {PlatformProfile} profile
 * @returns {Record<string, string[]>}
 */
const availableEncoderPresets = (profile) => {
	const out = {};
	for (const family of availableEncoderFamilies(profile)) {
		out[family] = ENCODER_PRESETS[family] || [];
	}
	return out;
};

/**
 * Map of family → default preset, restricted to this profile.
 *
 * @param {PlatformProfile} profile
 * @returns {Record<string, string>}
 */
const defaultEncoderPresets = (profile) => {
	const out = {};
	for (const family of availableEncoderFamilies(profile)) {
		if (DEFAULT_ENCODER_PRESETS[family]) out[family] = DEFAULT_ENCODER_PRESETS[family];
	}
	return out;
};

export { selectPlatformProfile, currentPlatformProfile, resetPlatformProfileCache, availableEncoderFamilies, availableEncoderPresets, defaultEncoderPresets };
