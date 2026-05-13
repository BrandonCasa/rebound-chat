/**
 * Stable Uplink — CBR with a tight VBV buffer.
 *
 * Targets capped or contended uplinks where peak instantaneous bitrate
 * matters more than maximum quality per bit: mobile hotspots, hotel
 * Wi-Fi, residential connections during a Discord call + game, etc.
 * Variable Bitrate's instantaneous burst can saturate the link even
 * though the average is well within budget; CBR plus a 0.5×-bitrate
 * VBV window forces convergence inside half a second and meaningfully
 * lowers peak.
 *
 *   - nvencRc: "cbr"            -- constant bitrate. NVENC's rate
 *                                  controller stops banking bits for
 *                                  later complex frames; output sits
 *                                  much closer to the configured ceiling.
 *   - vbvMultiplier: 0.5        -- 0.5-second VBV window. Tighter than
 *                                  the 1.0 default. Per-segment file
 *                                  sizes converge sharply.
 *   - encoderPreset: "p4"       -- "ll" alias. Pairs with tune=ull.
 *   - nvencTune: "ull"          -- ultra-low-latency.
 *   - nvencMultipass: "disabled"
 *   - nvencLookahead: 0
 *   - nvencBFrames: 0
 *   - nvencBRefMode: "disabled"
 *   - nvencTemporalAq: false    -- meaningless without lookahead.
 *
 * Tradeoff vs. Low Latency: same latency profile, slightly lower
 * quality on motion-heavy scenes (CBR cannot save bits for spikes),
 * but much steadier per-second uplink usage.
 *
 * @type {import("../types.js").StreamingProfile}
 */
const stableUplink = {
	id: "stable-uplink",
	label: "Stable Uplink",
	description: "CBR with a tight VBV buffer. Best for mobile hotspots and capped uplinks.",
	latencyHint: "Similar to Low Latency but with more predictable per-second bitrate.",
	values: {
		encoderPreset: "p4",
		nvencRc: "cbr",
		vbvMultiplier: 0.5,
		nvencTune: "ull",
		nvencMultipass: "disabled",
		nvencLookahead: 0,
		nvencBFrames: 0,
		nvencBRefMode: "disabled",
		nvencTemporalAq: false,
	},
};

export default stableUplink;
