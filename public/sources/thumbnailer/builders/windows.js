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
 * `buildPlan` additionally exposes an `identifyFailures(stderrLine)` hook
 * the pool uses to attribute setup-time `gfxcapture` errors back to the
 * source that owns them. Filter graph init is all-or-nothing in ffmpeg,
 * so without this attribution one bad window (e.g. a system-tray helper
 * with no capture surface) would poison every other source in the pool.
 *
 * `buildProbePlan` returns a one-shot, single-source argv the pool uses
 * to test a quarantined source without disturbing the main pool. The
 * probe captures one frame and exits, so a healthy source produces an
 * `exit 0` and a sick source produces the same `Failed to ...` lines
 * `identifyFailures` already understands.
 *
 * @typedef {import("../../types.js").SourceInfo} SourceInfo
 * @typedef {import("../../types.js").ThumbnailRequest} ThumbnailRequest
 * @typedef {{ request: ThumbnailRequest, outputPath: string }} BuilderItem
 * @typedef {{ argv: string[], identifyFailures: (line: string) => string[] }} SnapshotPlan
 */

import { escapeFilterValue, parseElectronScreenIndex, sourceNameToCaseInsensitiveRegex } from "../../../streaming/strings.js";

const PROBE_FRAMERATE = 2;
const DEFAULT_SCALE = 0.5;

// gfxcapture, hwdownload, format, fps, scale, format — keep in sync with `buildItemChain`.
const FILTERS_PER_CHAIN = 6;

const GFXCAPTURE_ID_RE = /Parsed_gfxcapture_(\d+)\b/g;
const GFXCAPTURE_FAILURE_RE = /Failed to (?:find capture source|setup graphics capture|configure output pad)/;

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
 * @param {Map<number, string>} gfxcaptureIdToSource
 * @returns {(line: string) => string[]}
 */
const makeIdentifyFailures = (gfxcaptureIdToSource) => (line) => {
	if (typeof line !== "string" || !GFXCAPTURE_FAILURE_RE.test(line)) return [];
	const ids = new Set();
	for (const match of line.matchAll(GFXCAPTURE_ID_RE)) {
		const filterId = Number(match[1]);
		const sourceId = gfxcaptureIdToSource.get(filterId);
		if (sourceId) ids.add(sourceId);
	}
	return Array.from(ids);
};

/**
 * Build the argv plus a stderr-attribution helper for the pool.
 *
 * @param {BuilderItem[]} items
 * @returns {SnapshotPlan}
 */
const buildPlan = (items) => {
	if (!Array.isArray(items) || items.length === 0) {
		throw new TypeError("buildPlan requires at least one item.");
	}

	/**
	 * Filter ids in a `filter_complex` are assigned globally in the order
	 * the filters appear. With `FILTERS_PER_CHAIN` filters per chain, the
	 * `gfxcapture` instance for items[i] is the (i * FILTERS_PER_CHAIN)-th
	 * filter overall. ffmpeg labels it `Parsed_gfxcapture_<id>` in stderr.
	 *
	 * @type {Map<number, string>}
	 */
	const gfxcaptureIdToSource = new Map();
	for (let index = 0; index < items.length; index += 1) {
		gfxcaptureIdToSource.set(index * FILTERS_PER_CHAIN, items[index].request.sourceId);
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

	return { argv, identifyFailures: makeIdentifyFailures(gfxcaptureIdToSource) };
};

/**
 * @param {BuilderItem[]} items
 * @returns {string[]}
 */
const buildArgs = (items) => buildPlan(items).argv;

/**
 * Build a one-shot single-source argv used to probe a quarantined
 * source without disturbing the running pool.
 *
 * The plan attaches `gfxcapture` to a single source, captures exactly
 * one frame (`-frames:v 1`), and writes it to `item.outputPath`. ffmpeg
 * exits 0 if the source is healthy and non-zero (with the same
 * `Failed to ...` lines we already attribute) if it isn't.
 *
 * @param {BuilderItem} item
 * @returns {SnapshotPlan}
 */
const buildProbePlan = (item) => {
	if (!item || !item.request || !item.outputPath) {
		throw new TypeError("buildProbePlan requires a single { request, outputPath } item.");
	}

	const scale = clampScale(item.request.scale);
	const sourceFilter = buildSourceFilter(item.request);
	const filterComplex = `${sourceFilter},hwdownload,format=bgra,scale=iw*${scale}:ih*${scale},format=rgba[s0]`;

	const argv = [
		"-hide_banner",
		"-nostdin",
		"-loglevel",
		"error",
		"-y",
		"-filter_complex",
		filterComplex,
		"-map",
		"[s0]",
		"-frames:v",
		"1",
		"-an",
		"-f",
		"image2",
		"-c:v",
		"png",
		"-compression_level",
		"3",
		item.outputPath,
	];

	// In a single-source filter graph the lone gfxcapture is filter id 0.
	const gfxcaptureIdToSource = new Map([[0, item.request.sourceId]]);
	return { argv, identifyFailures: makeIdentifyFailures(gfxcaptureIdToSource) };
};

export { buildArgs, buildPlan, buildProbePlan, buildSourceFilter, DEFAULT_SCALE, FILTERS_PER_CHAIN };
