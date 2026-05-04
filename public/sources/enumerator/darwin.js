/**
 * Window + screen enumeration on macOS without `desktopCapturer`.
 *
 * Windows: AppleScript via `osascript -ss` walks `System Events` and pulls
 * the application name + window title for each visible process. Returns the
 * pid + title hash so identifiers stay stable across enumerations.
 *
 * Screens: `system_profiler SPDisplaysDataType -json` enumerates connected
 * displays. We map each display into a `screen:<index>` id matching the
 * order avfoundation expects (verified via `ffmpeg -f avfoundation
 * -list_devices true -i ""`).
 *
 * Output is intentionally narrowed to `kind` + identity + display name; the
 * thumbnailer is what later opens the actual capture handle.
 *
 * @typedef {import("../types.js").SourceInfo} SourceInfo
 * @typedef {import("../types.js").EnumeratorOptions} EnumeratorOptions
 */

import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const APPLESCRIPT = [
	"set output to {}",
	'tell application "System Events"',
	"  set procList to (every process whose visible is true and background only is false)",
	"  repeat with proc in procList",
	"    set procName to name of proc",
	"    set procPid to unix id of proc",
	"    try",
	"      set winList to windows of proc",
	"      repeat with win in winList",
	"        try",
	"          set winName to name of win",
	'          if winName is not missing value and winName is not "" then',
	'            set end of output to procPid & "\\t" & procName & "\\t" & winName',
	"          end if",
	"        end try",
	"      end repeat",
	"    end try",
	"  end repeat",
	"end tell",
	"set AppleScript's text item delimiters to linefeed",
	"return output as string",
].join("\n");

const SYSTEM_PROFILER_CMD = "/usr/sbin/system_profiler";
const SYSTEM_PROFILER_ARGS = ["SPDisplaysDataType", "-json"];

const hashWindowId = (parts) => createHash("sha1").update(parts.join("|")).digest("hex").slice(0, 12);

/**
 * @param {string} stdout
 * @returns {SourceInfo[]}
 */
const parseAppleScriptOutput = (stdout) => {
	const sources = [];
	for (const line of stdout.split(/\r?\n/)) {
		const trimmed = line.trim();
		if (!trimmed) continue;
		const [pidRaw, appName, ...titleParts] = trimmed.split("\t");
		const title = titleParts.join("\t");
		const pid = Number.parseInt(pidRaw, 10);
		if (!title || !Number.isFinite(pid)) continue;

		sources.push({
			id: `window:${hashWindowId([pid, title])}`,
			kind: "window",
			name: title,
			appName: (appName || "").trim(),
			pid,
		});
	}
	return sources;
};

/**
 * @param {string} stdout
 * @returns {SourceInfo[]}
 */
const parseDisplaysOutput = (stdout) => {
	let parsed;
	try {
		parsed = JSON.parse(stdout);
	} catch (_err) {
		return [];
	}

	const card = parsed?.SPDisplaysDataType?.[0];
	const displays = card?.spdisplays_ndrvs || [];
	return displays.map((display, index) => ({
		id: `screen:${index}`,
		kind: "screen",
		name: display._name || `Display ${index}`,
		displayId: String(display._spdisplays_displayID || index),
	}));
};

/**
 * @returns {Promise<SourceInfo[]>}
 */
const enumerateWindows = async () => {
	const { stdout } = await execFileAsync("/usr/bin/osascript", ["-e", APPLESCRIPT], {
		maxBuffer: 4 * 1024 * 1024,
		timeout: 5000,
	});
	return parseAppleScriptOutput(stdout);
};

/**
 * @returns {Promise<SourceInfo[]>}
 */
const enumerateScreens = async () => {
	try {
		const { stdout } = await execFileAsync(SYSTEM_PROFILER_CMD, SYSTEM_PROFILER_ARGS, {
			maxBuffer: 4 * 1024 * 1024,
			timeout: 5000,
		});
		const screens = parseDisplaysOutput(stdout);
		return screens.length ? screens : [{ id: "screen:0", kind: "screen", name: "Primary Display (0)", displayId: "0" }];
	} catch (_err) {
		return [{ id: "screen:0", kind: "screen", name: "Primary Display (0)", displayId: "0" }];
	}
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

export { enumerate, parseAppleScriptOutput, parseDisplaysOutput };
