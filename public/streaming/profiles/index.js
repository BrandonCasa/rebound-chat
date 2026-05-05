/**
 * Streaming quality profiles: curated NVENC parameter sets.
 *
 * Not to be confused with `public/streaming/platform/profiles.js`, which
 * declares **PlatformProfiles** — what each host's bundled FFmpeg can
 * actually do. The profiles in this directory describe encoder
 * trade-offs (latency vs. quality) and apply on top of whatever the
 * platform provides.
 *
 * To add a profile:
 *   1. Create a new file (e.g. `stableUplink.js`) that default-exports
 *      a `StreamingProfile`.
 *   2. Import it here and append it to `STREAMING_PROFILES`.
 *
 * Profiles are intentionally `Partial<StreamConfig>`: applying a
 * profile is `{ ...currentSettings, ...profile.values }` — no
 * special-casing per profile. Custom edits diverge from any profile
 * and are surfaced by `detectProfile` (Plan 04).
 *
 * @typedef {import("../types.js").StreamingProfile} StreamingProfile
 * @typedef {import("../types.js").StreamConfig} StreamConfig
 */

import lowLatency from "./lowLatency.js";
import balanced from "./balanced.js";
import quality from "./quality.js";
import stableUplink from "./stableUplink.js";

/** @type {StreamingProfile[]} */
const STREAMING_PROFILES = [lowLatency, balanced, quality, stableUplink];

/**
 * Default profile for new installs. Mirrors `buildDefaultSettings`'s
 * NVENC block: Low Latency was chosen for live-streaming gameplay,
 * which is the dominant use case for this project.
 *
 * @type {string}
 */
const DEFAULT_PROFILE_ID = lowLatency.id;

/**
 * Look up a profile by id. Returns `undefined` if no profile matches —
 * the renderer treats that as "custom" (the user diverged from every
 * registered profile by editing fields directly).
 *
 * @param {string} id
 * @returns {StreamingProfile | undefined}
 */
const getProfile = (id) => STREAMING_PROFILES.find((profile) => profile.id === id);

/**
 * Apply a profile on top of an existing settings object. The merge is
 * shallow because `StreamingProfile.values` is a flat partial of
 * `StreamConfig`. Returns a new object; `settings` is not mutated.
 *
 * @param {StreamingProfile} profile
 * @param {StreamConfig | Record<string, unknown>} settings
 * @returns {StreamConfig | Record<string, unknown>}
 */
const applyProfile = (profile, settings) => ({ ...settings, ...profile.values });

export { STREAMING_PROFILES, DEFAULT_PROFILE_ID, getProfile, applyProfile, lowLatency, balanced, quality, stableUplink };
