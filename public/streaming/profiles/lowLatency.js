/**
 * Low Latency (gaming) — the new effective default for NVENC.
 *
 * Every flag in this profile is chosen to remove latency floors that
 * would otherwise be added inside the encoder, on top of capture and
 * network latency. The rationale per flag:
 *
 *   - encoderPreset: "p4"     -- "ll" alias in NVENC_PRESET_ALIASES.
 *                                p5/p6 trade encode time for quality;
 *                                with `tune ull` p4 is the documented
 *                                low-latency intent.
 *   - nvencTune: "ull"        -- ultra-low-latency. The whole point.
 *   - nvencMultipass: "disabled"
 *                              -- avoid a full first-pass encode at
 *                                full resolution; halves NVENC engine
 *                                occupancy.
 *   - nvencRc: "vbr"          -- variable bitrate; CQ caps quality.
 *   - nvencCq: 23             -- mild quality cap, no latency cost.
 *   - nvencSpatialAq: true    -- cheap, real visual benefit on flat
 *                                regions (sky, walls).
 *   - nvencTemporalAq: false  -- depends on lookahead; meaningless
 *                                with lookahead=0.
 *   - nvencBRefMode: "disabled"
 *   - nvencBFrames: 0         -- B-frame reordering forces the encoder
 *                                to hold frames in non-display order
 *                                until the reference structure is
 *                                satisfied. Each B-frame ≈ one
 *                                additional frame of output latency.
 *   - nvencLookahead: 0       -- lookahead is a hard latency floor:
 *                                the encoder cannot emit frame N until
 *                                it has seen frame N+lookahead. At
 *                                30 fps a lookahead of 16 = 533 ms
 *                                before the first frame ever leaves.
 *
 * @type {import("../types.js").StreamingProfile}
 */
const lowLatency = {
	id: "low-latency",
	label: "Low Latency (gaming)",
	description: "Minimal encoder buffering. Every NVENC flag that would hold frames is off.",
	latencyHint: "~500 ms glass-to-glass",
	values: {
		encoderPreset: "p4",
		nvencTune: "ull",
		nvencMultipass: "disabled",
		nvencRc: "vbr",
		nvencCq: 23,
		nvencSpatialAq: true,
		nvencTemporalAq: false,
		nvencBRefMode: "disabled",
		nvencBFrames: 0,
		nvencLookahead: 0,
	},
};

export default lowLatency;
