/**
 * Pure FFmpeg argv builder for Linux snapshot capture.
 *
 * `x11grab` reads the X server's framebuffer; per-window capture requires
 * an offset+size derived from the enumerator. When the enumerator gave us
 * window bounds we slice the screen via `+x,y` and `-video_size WxH`,
 * otherwise we capture the full root window. Distros without `xrandr` or
 * `wmctrl` will have already hit the enumerator fallback, so we never
 * generate args for an unknown source here.
 *
 * Every watched source is folded into a single ffmpeg invocation: one
 * `-f x11grab` input per source, then a `filter_complex` with one chain
 * per input so a shared ffmpeg child keeps many thumbnails fresh at once.
 * Each chain ends with `scale=iw*<scale>:ih*<scale>` so the captured PNG
 * is a fraction (default 50%) of the source's native size.
 *
 * @typedef {import("../../types.js").ThumbnailRequest} ThumbnailRequest
 * @typedef {{ request: ThumbnailRequest, outputPath: string }} BuilderItem
 */

const DEFAULT_DISPLAY = ":0.0";
const DEFAULT_SCALE = 0.5;

const clampScale = (raw) => {
	const value = Number(raw);
	if (!Number.isFinite(value) || value <= 0) return DEFAULT_SCALE;
	return Math.min(value, 1);
};

const intervalSecondsFor = (request) => Math.max(1, Math.round((request.intervalMs ?? 1000) / 1000));

/**
 * @param {{ request: ThumbnailRequest, outputPath: string }} item
 * @returns {string[]}
 */
const inputArgsFor = (item) => {
	const display = process.env.DISPLAY || DEFAULT_DISPLAY;
	const bounds = item.request.source.bounds;
	const args = ["-f", "x11grab", "-framerate", "1", "-draw_mouse", "0"];

	if (bounds && Number.isFinite(bounds.width) && Number.isFinite(bounds.height)) {
		args.push("-video_size", `${bounds.width}x${bounds.height}`);
		const x = Number.isFinite(bounds.x) ? bounds.x : 0;
		const y = Number.isFinite(bounds.y) ? bounds.y : 0;
		args.push("-i", `${display}+${x},${y}`);
	} else {
		args.push("-i", display);
	}

	return args;
};

/**
 * @param {{ request: ThumbnailRequest, outputPath: string }[]} items
 * @returns {string[]}
 */
const buildArgs = (items) => {
	if (!Array.isArray(items) || items.length === 0) {
		throw new TypeError("buildArgs requires at least one item.");
	}

	const argv = ["-hide_banner", "-nostdin", "-loglevel", "error", "-y", "-thread_queue_size", "512"];
	items.forEach((item) => {
		argv.push(...inputArgsFor(item));
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

/**
 * x11grab failures show up as input-open errors before the filter graph
 * runs, so we don't have a stable per-source stderr signature to attribute
 * against. Returning an empty array lets the pool fall back to its global
 * circuit breaker on this platform.
 *
 * @param {BuilderItem[]} items
 * @returns {{ argv: string[], identifyFailures: (line: string) => string[] }}
 */
const buildPlan = (items) => ({ argv: buildArgs(items), identifyFailures: () => [] });

export { buildArgs, buildPlan, DEFAULT_SCALE };
