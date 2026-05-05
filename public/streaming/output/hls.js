/**
 * Pure HLS output argv builder.
 *
 * Given a normalized config, returns the argv tail starting with `-f hls`.
 * No I/O, no logging, no `this`.
 *
 * @typedef {import("../types.js").StreamConfig} StreamConfig
 */

/**
 * @param {StreamConfig} config
 * @returns {string[]}
 */
const buildArgs = (config) => [
	"-f",
	"hls",
	"-hls_time",
	String(config.hlsTime),
	"-hls_list_size",
	String(config.hlsListSize),
	"-hls_flags",
	"delete_segments+independent_segments+temp_file",
	"-hls_segment_type",
	"fmp4",
	"-hls_fmp4_init_filename",
	"init.mp4",
	"-master_pl_name",
	"master.m3u8",
	"-hls_segment_filename",
	"segment-%06d.m4s",
	"video.m3u8",
];

export { buildArgs };
