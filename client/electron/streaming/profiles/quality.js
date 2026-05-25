/**
 * Quality — the pre-Plan-01 defaults, preserved as an explicit choice.
 *
 * Maximizes per-bit visual quality at the cost of ~600 ms of additional
 * latency inside the encoder. Suitable when the broadcast is closer to
 * a recorded artifact than a live conversation: gameplay highlights,
 * VOD-first content, or any stream where the audience cannot
 * meaningfully interact within the latency window anyway.
 *
 *   - encoderPreset: "p6"       -- NVENC's "slow" alias. More analysis
 *                                  per macroblock, better motion search.
 *   - nvencMultipass: "fullres" -- full first-pass encode at full
 *                                  resolution. Roughly doubles GPU
 *                                  encode time per frame.
 *   - nvencTemporalAq: true     -- requires lookahead.
 *   - nvencBFrames: 3           -- three B-frames per GOP, all reused
 *                                  as references via -b_ref_mode middle.
 *   - nvencBRefMode: "middle"   -- pyramid B-frame referencing.
 *   - nvencLookahead: 16        -- ~533 ms at 30 fps, ~266 ms at 60 fps.
 *                                  This is the dominant latency cost.
 *
 * @type {import("../types.js").StreamingProfile}
 */
const quality = {
	id: "quality",
	label: "Quality",
	description: "Maximizes per-bit visual quality. Adds ~600 ms of encoder latency.",
	latencyHint: "~1.5 s glass-to-glass",
	values: {
		encoderPreset: "p6",
		nvencTune: "ull",
		nvencMultipass: "fullres",
		nvencRc: "vbr",
		nvencCq: 23,
		nvencSpatialAq: true,
		nvencTemporalAq: true,
		nvencBRefMode: "middle",
		nvencBFrames: 3,
		nvencLookahead: 16,
	},
};

export default quality;
