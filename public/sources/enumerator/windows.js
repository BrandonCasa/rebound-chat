/**
 * Window + screen enumeration on Windows without `desktopCapturer`.
 *
 * Both probes are PowerShell-based so we share startup cost and stay
 * symmetrical:
 *   - Windows: `Get-Process` filtered server-side to processes that own a
 *     top-level window. Filtering happens before serialization, so we get
 *     ~10-30 rows instead of the 200-400 a `tasklist /v` dump would emit.
 *     This avoids the multi-second hang `tasklist /v` exhibits on busy
 *     systems because it has to resolve verbose process metadata (CPU
 *     time, memory, session, user, window title) for every PID before any
 *     output is produced.
 *   - Screens: `System.Windows.Forms.Screen::AllScreens` so we get stable
 *     display ids without depending on Electron's `screen` module from a
 *     worker context. Cached for the life of the process.
 *
 * Both probes emit one compact JSON object per line. The parsers tolerate
 * malformed lines so a transient PowerShell warning doesn't kill the
 * enumeration as a whole.
 *
 * The functions below are intentionally I/O-shaped (Promise-returning) so a
 * future implementation can swap the transport (e.g. a native addon) without
 * breaking callers.
 *
 * @typedef {import("../types.js").SourceInfo} SourceInfo
 * @typedef {import("../types.js").EnumeratorOptions} EnumeratorOptions
 */

import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const POWERSHELL_CMD = "powershell.exe";
const POWERSHELL_BASE_ARGS = ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command"];

const SCREEN_PROBE_ARGS = [
	...POWERSHELL_BASE_ARGS,
	[
		"Add-Type -AssemblyName System.Windows.Forms;",
		"$idx=0;",
		"[System.Windows.Forms.Screen]::AllScreens | ForEach-Object {",
		"  $bounds=$_.Bounds;",
		"  [PSCustomObject]@{ index=$idx; primary=$_.Primary; deviceName=$_.DeviceName; x=$bounds.X; y=$bounds.Y; width=$bounds.Width; height=$bounds.Height } | ConvertTo-Json -Compress;",
		"  $idx++;",
		"}",
	].join(" "),
];

const WINDOW_PROBE_ARGS = [
	...POWERSHELL_BASE_ARGS,
	[
		"Get-Process |",
		"Where-Object { $_.MainWindowHandle -ne 0 -and $_.MainWindowTitle } |",
		"ForEach-Object {",
		"  [PSCustomObject]@{ pid=$_.Id; name=$_.ProcessName; title=$_.MainWindowTitle } | ConvertTo-Json -Compress;",
		"}",
	].join(" "),
];

const HIDDEN_PROCESSES = new Set(["conhost", "RuntimeBroker", "TextInputHost", "ApplicationFrameHost", "SearchHost", "StartMenuExperienceHost"]);

const hashWindowId = (parts) => createHash("sha1").update(parts.join("|")).digest("hex").slice(0, 12);

/**
 * @param {string} stdout JSON-per-line PowerShell output from the window probe.
 * @returns {SourceInfo[]}
 */
const parseWindowProbeOutput = (stdout) => {
	const sources = [];
	for (const line of stdout.split(/\r?\n/)) {
		const trimmed = line.trim();
		if (!trimmed) continue;

		let row;
		try {
			row = JSON.parse(trimmed);
		} catch (_err) {
			continue;
		}

		const pid = Number(row.pid);
		const title = typeof row.title === "string" ? row.title.trim() : "";
		const processName = typeof row.name === "string" ? row.name : "";
		if (!Number.isFinite(pid) || !title) continue;
		if (HIDDEN_PROCESSES.has(processName)) continue;
		if (title.startsWith("OleMainThreadWndName")) continue;

		sources.push({
			id: `window:${hashWindowId([pid, title])}`,
			kind: "window",
			name: title,
			appName: processName,
			pid,
		});
	}
	return sources;
};

/**
 * @param {string} stdout JSON-per-line PowerShell output from the screen probe.
 * @returns {SourceInfo[]}
 */
const parseScreenOutput = (stdout) => {
	const sources = [];
	for (const line of stdout.split(/\r?\n/)) {
		const trimmed = line.trim();
		if (!trimmed) continue;
		try {
			const screen = JSON.parse(trimmed);
			const index = Number(screen.index ?? 0);
			sources.push({
				id: `screen:${index}`,
				kind: "screen",
				name: screen.primary ? `Primary Display (${index})` : `Display ${index}`,
				displayId: String(screen.deviceName || index),
				bounds: {
					width: Number(screen.width ?? 0),
					height: Number(screen.height ?? 0),
				},
			});
		} catch (_err) {
			// Skip malformed JSON lines so a transient PowerShell hiccup doesn't kill enumeration.
		}
	}
	return sources;
};

let cachedScreens = null;

/**
 * @returns {Promise<SourceInfo[]>}
 */
const enumerateScreens = async () => {
	if (cachedScreens) return cachedScreens;
	try {
		const { stdout } = await execFileAsync(POWERSHELL_CMD, SCREEN_PROBE_ARGS, {
			windowsHide: true,
			maxBuffer: 1024 * 1024,
			timeout: 5000,
		});
		cachedScreens = parseScreenOutput(stdout);
	} catch (_err) {
		cachedScreens = [
			{
				id: "screen:0",
				kind: "screen",
				name: "Primary Display (0)",
				displayId: "0",
			},
		];
	}
	return cachedScreens;
};

/**
 * @returns {Promise<SourceInfo[]>}
 */
const enumerateWindows = async () => {
	const { stdout } = await execFileAsync(POWERSHELL_CMD, WINDOW_PROBE_ARGS, {
		windowsHide: true,
		maxBuffer: 4 * 1024 * 1024,
		timeout: 8000,
	});
	return parseWindowProbeOutput(stdout);
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

const resetCacheForTests = () => {
	cachedScreens = null;
};

export { enumerate, parseWindowProbeOutput, parseScreenOutput, resetCacheForTests };
