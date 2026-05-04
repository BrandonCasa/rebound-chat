import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { selectEnumerator } from "../enumerator/index.js";
import { parseWindowProbeOutput, parseScreenOutput } from "../enumerator/windows.js";
import { parseWmctrlOutput, parseXrandrOutput } from "../enumerator/linux.js";
import { parseAppleScriptOutput, parseDisplaysOutput } from "../enumerator/darwin.js";

describe("selectEnumerator", () => {
	it("falls back to an empty enumerator for unknown platforms", async () => {
		const enumerator = selectEnumerator("haiku");
		const sources = await enumerator.enumerate();
		assert.deepEqual(sources, []);
	});
});

describe("windows.parseWindowProbeOutput", () => {
	it("parses JSON-per-line probe output into window sources, dropping hidden shells and empty titles", () => {
		const stdout = [
			JSON.stringify({ pid: 1234, name: "explorer", title: "File Explorer" }),
			JSON.stringify({ pid: 2222, name: "conhost", title: "Console Window Host" }),
			JSON.stringify({ pid: 5678, name: "notepad", title: "Untitled - Notepad" }),
			JSON.stringify({ pid: 9999, name: "svchost", title: "" }),
			JSON.stringify({ pid: 4242, name: "code", title: "OleMainThreadWndName-1" }),
		].join("\n");

		const sources = parseWindowProbeOutput(stdout);
		assert.equal(sources.length, 2);
		assert.deepEqual(
			sources.map((source) => ({ kind: source.kind, name: source.name, appName: source.appName, pid: source.pid })),
			[
				{ kind: "window", name: "File Explorer", appName: "explorer", pid: 1234 },
				{ kind: "window", name: "Untitled - Notepad", appName: "notepad", pid: 5678 },
			]
		);
	});

	it("derives stable ids for identical pid + title pairs", () => {
		const stdout = JSON.stringify({ pid: 1, name: "a", title: "Same" });
		const [first] = parseWindowProbeOutput(stdout);
		const [second] = parseWindowProbeOutput(stdout);
		assert.equal(first.id, second.id);
	});

	it("skips malformed JSON lines without throwing", () => {
		const stdout = ["not json", JSON.stringify({ pid: 7, name: "notepad", title: "Real" })].join("\n");
		const sources = parseWindowProbeOutput(stdout);
		assert.equal(sources.length, 1);
		assert.equal(sources[0].name, "Real");
	});
});

describe("windows.parseScreenOutput", () => {
	it("parses one JSON object per line into screen sources", () => {
		const stdout = [
			JSON.stringify({ index: 0, primary: true, deviceName: "\\\\.\\DISPLAY1", x: 0, y: 0, width: 1920, height: 1080 }),
			JSON.stringify({ index: 1, primary: false, deviceName: "\\\\.\\DISPLAY2", x: 1920, y: 0, width: 2560, height: 1440 }),
		].join("\n");

		const sources = parseScreenOutput(stdout);
		assert.equal(sources.length, 2);
		assert.equal(sources[0].id, "screen:0");
		assert.equal(sources[0].name, "Primary Display (0)");
		assert.deepEqual(sources[0].bounds, { width: 1920, height: 1080 });
		assert.equal(sources[1].id, "screen:1");
	});
});

describe("linux.parseWmctrlOutput", () => {
	it("parses wmctrl -lpG rows into window sources", () => {
		const stdout = ["0x0220000a  0 1234   100 200 800 600 host  Some Window Title", "0x0220000b  0 5678   0 0 1024 768 host  Another"].join("\n");
		const sources = parseWmctrlOutput(stdout);
		assert.equal(sources.length, 2);
		assert.equal(sources[0].name, "Some Window Title");
		assert.equal(sources[0].pid, 1234);
		assert.deepEqual(sources[0].bounds, { width: 800, height: 600, x: 100, y: 200 });
	});
});

describe("linux.parseXrandrOutput", () => {
	it("parses xrandr --listmonitors entries", () => {
		const stdout = ["Monitors: 2", " 0: +*HDMI-1 1920/520x1080/290+0+0  HDMI-1", " 1: +DP-1 2560/600x1440/340+1920+0  DP-1"].join("\n");
		const sources = parseXrandrOutput(stdout);
		assert.equal(sources.length, 2);
		assert.equal(sources[0].displayId, "HDMI-1");
		assert.equal(sources[0].bounds.width, 1920);
		assert.equal(sources[1].id, "screen:1");
	});
});

describe("darwin.parseAppleScriptOutput", () => {
	it("parses tab-separated rows", () => {
		const stdout = ["1234\tFinder\tDesktop", "5678\tSafari\tHacker News", "9999\tBackground\t"].join("\n");
		const sources = parseAppleScriptOutput(stdout);
		assert.equal(sources.length, 2);
		assert.equal(sources[0].name, "Desktop");
		assert.equal(sources[1].appName, "Safari");
	});
});

describe("darwin.parseDisplaysOutput", () => {
	it("returns an entry per attached display", () => {
		const stdout = JSON.stringify({
			SPDisplaysDataType: [
				{
					spdisplays_ndrvs: [
						{ _name: "Built-in Retina Display", _spdisplays_displayID: 1 },
						{ _name: "Studio Display", _spdisplays_displayID: 2 },
					],
				},
			],
		});
		const sources = parseDisplaysOutput(stdout);
		assert.equal(sources.length, 2);
		assert.equal(sources[0].id, "screen:0");
		assert.equal(sources[1].displayId, "2");
	});
});
