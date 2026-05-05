/**
 * Pure HLS output argv builder.
 *
 * Given a normalized config, returns the argv tail starting with `-f hls`.
 * No I/O, no logging, no `this`.
 *
 * @typedef {import("../types.js").StreamConfig} StreamConfig
 */

/**
 * Build the HLS output argv tail.
 *
 * The `discontStart` and `startNumber` parameters wire up
 * server-driven adaptive respawns: when FFmpeg is restarted with
 * different encoder parameters mid-stream, we set both so that the
 * resulting `video.m3u8`:
 *
 *   1. Begins with `#EXT-X-DISCONTINUITY` before the first new segment
 *      (the player tears down its decoder and re-inits cleanly), and
 *   2. Continues `#EXT-X-MEDIA-SEQUENCE` from where the previous
 *      generation left off, so live HLS players don't see the playlist
 *      apparently rewind to segment 0.
 *
 * `discontStart` defaults to false so the very first generation looks
 * exactly like the legacy single-process case. `startNumber` defaults
 * to 0 (FFmpeg default).
 *
 * @param {StreamConfig} config
 * @param {{ discontStart?: boolean, startNumber?: number }} [options]
 * @returns {string[]}
 */
const buildArgs = (config, options = {}) => {
	const flags = ["delete_segments", "independent_segments", "temp_file"];
	if (options.discontStart) flags.push("discont_start");

	const args = [
		"-f",
		"hls",
		"-hls_time",
		String(config.hlsTime),
		"-hls_list_size",
		String(config.hlsListSize),
		"-hls_flags",
		flags.join("+"),
		"-hls_segment_type",
		"fmp4",
		"-hls_fmp4_init_filename",
		"init.mp4",
		"-master_pl_name",
		"master.m3u8",
		"-hls_segment_filename",
		"segment-%06d.m4s",
	];

	if (Number.isInteger(options.startNumber) && options.startNumber > 0) {
		args.push("-start_number", String(options.startNumber));
	}

	args.push("video.m3u8");
	return args;
};

export { buildArgs };
