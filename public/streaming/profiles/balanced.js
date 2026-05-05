/**
 * Balanced — middle ground between Low Latency and Quality.
 *
 * Reintroduces a modest amount of encoder buffering for visibly better
 * compression at the cost of ~half a second of additional latency.
 * Intended for streams where the audience does not interact in real
 * time (e.g. cooking, music, talking-head) but the streamer still
 * wants the broadcast to feel "live" rather than archival.
 *
 *   - encoderPreset: "p5"      -- one notch slower than p4. NVENC's
 *                                 "medium" alias.
 *   - nvencMultipass: "qres"   -- quarter-resolution first pass.
 *                                 Cheaper than fullres, still gives
 *                                 the rate controller real lookahead
 *                                 information.
 *   - nvencTemporalAq: true    -- meaningful now that lookahead > 0.
 *   - nvencBFrames: 2          -- two B-frames per GOP. NVENC's B-ref
 *                                 mode reuses them as references so
 *                                 quality scales well with bitrate.
 *   - nvencBRefMode: "middle"  -- pyramid B-frame referencing.
 *   - nvencLookahead: 8        -- ~133 ms at 60 fps, ~266 ms at 30 fps.
 *
 * @type {import("../types.js").StreamingProfile}
 */
const balanced = {
	id: "balanced",
	label: "Balanced",
	description: "Adds modest encoder buffering for better quality at the cost of ~half a second of latency.",
	latencyHint: "~1 s glass-to-glass",
	values: {
		encoderPreset: "p5",
		nvencTune: "ull",
		nvencMultipass: "qres",
		nvencRc: "vbr",
		nvencCq: 23,
		nvencSpatialAq: true,
		nvencTemporalAq: true,
		nvencBRefMode: "middle",
		nvencBFrames: 2,
		nvencLookahead: 8,
	},
};

export default balanced;
