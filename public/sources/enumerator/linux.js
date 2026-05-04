/**
 * Window + screen enumeration on Linux without `desktopCapturer`.
 *
 * Windows: prefer `wmctrl -lpG`, fall back to `xdotool search "" getwindowname`
 * with a single-row scan. Both tools are universally available on X11
 * sessions; Wayland users are expected to install `wmctrl` from their
 * distro's repos. On Wayland-only hosts where neither is present, we
 * return an empty list rather than failing — the live page will show a
 * "no sources" hint and the user can fall back to manual FFmpeg input.
 *
 * Screens: parse `xrandr --listmonitors`. Returns one entry per attached
 * monitor in the same order x11grab consumes via `+x,y` offsets.
 *
 * @typedef {import("../types.js").SourceInfo} SourceInfo
 * @typedef {import("../types.js").EnumeratorOptions} EnumeratorOptions
 */

import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const hashWindowId = (parts) => createHash("sha1").update(parts.join("|")).digest("hex").slice(0, 12);

const tryExec = async (cmd, args) => {
	try {
		const { stdout } = await execFileAsync(cmd, args, { maxBuffer: 4 * 1024 * 1024, timeout: 5000 });
		return { ok: true, stdout };
	} catch (err) {
		return { ok: false, error: err };
	}
};

/**
 * @param {string} stdout `wmctrl -lpG` output.
 * @returns {SourceInfo[]}
 */
const parseWmctrlOutput = (stdout) => {
	const sources = [];
	for (const line of stdout.split(/\r?\n/)) {
		const trimmed = line.trim();
		if (!trimmed) continue;
		const parts = trimmed.split(/\s+/);
		if (parts.length < 8) continue;
		const [, , pidRaw, xRaw, yRaw, wRaw, hRaw, host, ...nameParts] = parts;
		const pid = Number.parseInt(pidRaw, 10);
		const width = Number.parseInt(wRaw, 10);
		const height = Number.parseInt(hRaw, 10);
		const x = Number.parseInt(xRaw, 10);
		const y = Number.parseInt(yRaw, 10);
		const titlePieces = nameParts.length ? nameParts : [host];
		const name = titlePieces.join(" ").trim();
		if (!name) continue;

		sources.push({
			id: `window:${hashWindowId([pid, name])}`,
			kind: "window",
			name,
			pid: Number.isFinite(pid) ? pid : undefined,
			bounds: Number.isFinite(width) && Number.isFinite(height) ? { width, height, x, y } : undefined,
		});
	}
	return sources;
};

/**
 * @param {string} stdout `xrandr --listmonitors` output.
 * @returns {SourceInfo[]}
 */
const parseXrandrOutput = (stdout) => {
	const lines = stdout.split(/\r?\n/);
	const sources = [];
	for (const line of lines) {
		const match = line.match(/^\s*(\d+):\s+\+?\*?(\S+)\s+(\d+)\/\d+x(\d+)\/\d+\+(\d+)\+(\d+)/);
		if (!match) continue;
		const [, indexRaw, deviceName, wRaw, hRaw] = match;
		const index = Number.parseInt(indexRaw, 10);
		sources.push({
			id: `screen:${index}`,
			kind: "screen",
			name: `Display ${index}`,
			displayId: deviceName,
			bounds: { width: Number.parseInt(wRaw, 10), height: Number.parseInt(hRaw, 10) },
		});
	}
	return sources;
};

/**
 * @returns {Promise<SourceInfo[]>}
 */
const enumerateWindows = async () => {
	const wmctrl = await tryExec("wmctrl", ["-lpG"]);
	if (wmctrl.ok) return parseWmctrlOutput(wmctrl.stdout);
	return [];
};

/**
 * @returns {Promise<SourceInfo[]>}
 */
const enumerateScreens = async () => {
	const xrandr = await tryExec("xrandr", ["--listmonitors"]);
	if (xrandr.ok) {
		const screens = parseXrandrOutput(xrandr.stdout);
		if (screens.length) return screens;
	}
	return [{ id: "screen:0", kind: "screen", name: "Primary Display (0)", displayId: "0" }];
};

/**
 * @param {EnumeratorOptions} [options]
 * @returns {Promise<SourceInfo[]>}
 */
const enumerate = async (options = {}) => {
	const types = new Set(options.types && options.types.length ? options.types : ["screen", "window"]);
	const tasks = [];
	if (types.has("screen")) tasks.push(enumerateScreens());
	if (types.has("window")) tasks.push(enumerateWindows());
	const results = await Promise.all(tasks);
	return results.flat();
};

export { enumerate, parseWmctrlOutput, parseXrandrOutput };
