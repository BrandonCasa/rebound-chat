/**
 * Pure FFmpeg argv builder for Windows snapshot capture.
 *
 * Strategy: Windows.Graphics.Capture via FFmpeg's `gfxcapture` source filter
 * (the same backend the live streamer uses for its fast path). All watched
 * sources are folded into a single `filter_complex` so one ffmpeg child
 * handles every screen and window simultaneously — the IPC bridge never has
 * to coordinate dozens of processes during a "show source picker" gust.
 *
 * Every chain ends with `scale=iw*<scale>:ih*<scale>` so the captured PNG
 * is a fraction (default 50%) of the source's native resolution. Using the
 * scale filter (rather than `gfxcapture`'s pre-attach `width`/`height`)
 * lets us derive the output size from whatever the source actually is at
 * capture time, which matters for windows whose bounds we never queried.
 *
 * Each chain maps to its own atomic PNG output via `-update 1
 * -atomic_writing 1`. Atomic replacement means the renderer never observes
 * a half-written frame even when the file watcher races the writer.
 *
 * @typedef {import("../../types.js").SourceInfo} SourceInfo
 * @typedef {import("../../types.js").ThumbnailRequest} ThumbnailRequest
 * @typedef {{ request: ThumbnailRequest, outputPath: string }} BuilderItem
 */

import { escapeFilterValue, parseElectronScreenIndex, sourceNameToCaseInsensitiveRegex } from "../../../streaming/strings.js";

const PROBE_FRAMERATE = 2;
const DEFAULT_SCALE = 0.5;

const clampScale = (raw) => {
	const value = Number(raw);
	if (!Number.isFinite(value) || value <= 0) return DEFAULT_SCALE;
	return Math.min(value, 1);
};

const intervalSecondsFor = (request) => Math.max(1, Math.round((request.intervalMs ?? 1000) / 1000));

/**
 * @param {ThumbnailRequest} request
 * @returns {string}
 */
const buildSourceFilter = (request) => {
	const { source } = request;
	const options = [];

	if (source.id.startsWith("screen:")) {
		options.push(`monitor_idx=${parseElectronScreenIndex(source.id)}`);
	} else {
		options.push(`window_title='${escapeFilterValue(sourceNameToCaseInsensitiveRegex(source.name))}'`);
	}

	options.push(`max_framerate=${PROBE_FRAMERATE}`);
	options.push("capture_cursor=0");
	options.push("output_fmt=bgra");
	return `gfxcapture=${options.join(":")}`;
};

/**
 * @param {BuilderItem} item
 * @param {number} index
 * @returns {string}
 */
const buildItemChain = (item, index) => {
	const seconds = intervalSecondsFor(item.request);
	const scale = clampScale(item.request.scale);
	const sourceFilter = buildSourceFilter(item.request);
	return `${sourceFilter},hwdownload,format=bgra,fps=1/${seconds},scale=iw*${scale}:ih*${scale},format=rgba[s${index}]`;
};

/**
 * @param {BuilderItem[]} items
 * @returns {string[]}
 */
const buildArgs = (items) => {
	if (!Array.isArray(items) || items.length === 0) {
		throw new TypeError("buildArgs requires at least one item.");
	}

	const filterComplex = items.map(buildItemChain).join(";");
	const argv = ["-hide_banner", "-nostdin", "-loglevel", "error", "-y", "-filter_complex", filterComplex];

	items.forEach((item, index) => {
		argv.push(
			"-map",
			`[s${index}]`,
			"-vsync",
			"vfr",
			"-an",
			"-f",
			"image2",
			"-update",
			"1",
			"-atomic_writing",
			"1",
			"-c:v",
			"png",
			"-compression_level",
			"3",
			item.outputPath
		);
	});

	return argv;
};

export { buildArgs, buildSourceFilter, DEFAULT_SCALE };
