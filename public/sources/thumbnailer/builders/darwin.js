/**
 * Pure FFmpeg argv builder for macOS snapshot capture.
 *
 * AVFoundation enumerates indices via `ffmpeg -f avfoundation -list_devices
 * true -i ""`; we map our `screen:N` ids 1:1 onto AVFoundation video device
 * indices. Window-level capture is not exposed by AVFoundation, so window
 * thumbnails fall back to the owning screen until a CoreGraphics-backed
 * helper is added.
 *
 * Every watched source is folded into a single ffmpeg invocation: one
 * `-f avfoundation -i N:none` per source, then a `filter_complex` with
 * one chain per input so a shared ffmpeg child can keep many thumbnails
 * fresh at once. Each chain ends with `scale=iw*<scale>:ih*<scale>` so the
 * captured PNG is a fraction (default 50%) of the display's native size.
 *
 * @typedef {import("../../types.js").ThumbnailRequest} ThumbnailRequest
 * @typedef {{ request: ThumbnailRequest, outputPath: string }} BuilderItem
 */

import { parseElectronScreenIndex } from "../../../streaming/strings.js";

const DEFAULT_SCALE = 0.5;

const clampScale = (raw) => {
	const value = Number(raw);
	if (!Number.isFinite(value) || value <= 0) return DEFAULT_SCALE;
	return Math.min(value, 1);
};

const intervalSecondsFor = (request) => Math.max(1, Math.round((request.intervalMs ?? 1000) / 1000));

/**
 * @param {ThumbnailRequest} request
 * @returns {number}
 */
const screenIndexFor = (request) => (request.source.id.startsWith("screen:") ? parseElectronScreenIndex(request.source.id) : 0);

/**
 * @param {BuilderItem[]} items
 * @returns {string[]}
 */
const buildArgs = (items) => {
	if (!Array.isArray(items) || items.length === 0) {
		throw new TypeError("buildArgs requires at least one item.");
	}

	const argv = ["-hide_banner", "-nostdin", "-loglevel", "error", "-y", "-thread_queue_size", "512"];

	items.forEach((item) => {
		argv.push("-f", "avfoundation", "-framerate", "1", "-capture_cursor", "0", "-i", `${screenIndexFor(item.request)}:none`);
	});

	const chains = items.map((item, index) => {
		const seconds = intervalSecondsFor(item.request);
		const scale = clampScale(item.request.scale);
		return `[${index}:v]scale=iw*${scale}:ih*${scale},fps=1/${seconds},format=rgba[s${index}]`;
	});
	argv.push("-filter_complex", chains.join(";"));

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

export { buildArgs, DEFAULT_SCALE };
