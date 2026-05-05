import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { selectThumbnailBuilder } from "../thumbnailer/builders/index.js";
import * as windows from "../thumbnailer/builders/windows.js";
import * as darwin from "../thumbnailer/builders/darwin.js";
import * as linux from "../thumbnailer/builders/linux.js";

const screenItem = (overrides = {}, outputPath = "C:/tmp/snap.png") => ({
	request: {
		sourceId: "screen:0",
		source: { id: "screen:0", kind: "screen", name: "Primary Display (0)" },
		intervalMs: 1000,
		scale: 0.5,
		...overrides,
	},
	outputPath,
});

const windowItem = (overrides = {}, outputPath = "C:/tmp/snap.png") => ({
	request: {
		sourceId: "window:abc",
		source: { id: "window:abc", kind: "window", name: "Notepad - Untitled.txt" },
		intervalMs: 1000,
		scale: 0.5,
		...overrides,
	},
	outputPath,
});

describe("selectThumbnailBuilder", () => {
	it("returns the windows builder on win32", () => {
		assert.equal(selectThumbnailBuilder("win32"), windows);
	});
	it("returns the darwin builder on macOS", () => {
		assert.equal(selectThumbnailBuilder("darwin"), darwin);
	});
	it("returns the linux builder on Linux", () => {
		assert.equal(selectThumbnailBuilder("linux"), linux);
	});
	it("throws when the platform is unsupported", () => {
		assert.throws(() => selectThumbnailBuilder("haiku"));
	});
});

describe("windows.buildArgs", () => {
	it("emits a gfxcapture filter chain with monitor_idx and a 0.5 scale for screens", () => {
		const args = windows.buildArgs([screenItem()]);
		const filterIdx = args.indexOf("-filter_complex");
		assert.notEqual(filterIdx, -1);
		const filter = args[filterIdx + 1];
		assert.match(filter, /^gfxcapture=monitor_idx=0/);
		assert.match(filter, /:capture_cursor=0:/);
		assert.match(filter, /,fps=1\/1,scale=iw\*0\.5:ih\*0\.5,format=rgba\[s0\]$/);
	});

	it("uses window_title for window sources and escapes special characters", () => {
		const args = windows.buildArgs([
			windowItem({
				source: { id: "window:abc", kind: "window", name: "App: my window" },
			}),
		]);
		const filter = args[args.indexOf("-filter_complex") + 1];
		assert.match(filter, /window_title='\(\?i\)\^App\\: my window\$'/);
	});

	it("rounds intervalMs to whole seconds with a 1-second floor", () => {
		const args = windows.buildArgs([screenItem({ intervalMs: 0 })]);
		const filter = args[args.indexOf("-filter_complex") + 1];
		assert.match(filter, /fps=1\/1/);
	});

	it("folds many sources into one filter_complex with one map per output path", () => {
		const args = windows.buildArgs([screenItem({}, "C:/tmp/screen.png"), windowItem({}, "C:/tmp/window.png")]);
		const filter = args[args.indexOf("-filter_complex") + 1];
		assert.equal(filter.split(";").length, 2);
		assert.match(filter, /\[s0\];/);
		assert.match(filter, /\[s1\]$/);

		const maps = args.reduce((acc, value, index) => {
			if (value === "-map") acc.push(args[index + 1]);
			return acc;
		}, []);
		assert.deepEqual(maps, ["[s0]", "[s1]"]);

		assert.equal(args[args.length - 1], "C:/tmp/window.png");
		const screenIdx = args.indexOf("C:/tmp/screen.png");
		assert.notEqual(screenIdx, -1);
	});

	it("targets each item's output path with -update 1 atomic writes", () => {
		const args = windows.buildArgs([screenItem({}, "C:/tmp/snap.png")]);
		assert.equal(args[args.length - 1], "C:/tmp/snap.png");
		assert.equal(args[args.indexOf("-update") + 1], "1");
		assert.equal(args[args.indexOf("-atomic_writing") + 1], "1");
		assert.equal(args[args.indexOf("-c:v") + 1], "png");
	});

	it("throws when given an empty item list", () => {
		assert.throws(() => windows.buildArgs([]));
	});
});

describe("windows.buildPlan", () => {
	it("returns argv equal to buildArgs and exposes an identifyFailures helper", () => {
		const items = [screenItem({}, "C:/tmp/screen.png"), windowItem({}, "C:/tmp/window.png")];
		const plan = windows.buildPlan(items);
		assert.deepEqual(plan.argv, windows.buildArgs(items));
		assert.equal(typeof plan.identifyFailures, "function");
	});

	it("blames the source whose gfxcapture filter id is referenced in a setup-time error line", () => {
		const items = [
			screenItem({ sourceId: "screen:0", source: { id: "screen:0", kind: "screen", name: "Primary Display (0)" } }, "C:/tmp/screen.png"),
			windowItem({ sourceId: "window:abc", source: { id: "window:abc", kind: "window", name: "Notepad" } }, "C:/tmp/notepad.png"),
			windowItem({ sourceId: "window:def", source: { id: "window:def", kind: "window", name: "RzMonitor" } }, "C:/tmp/rz.png"),
		];
		const plan = windows.buildPlan(items);
		// Filter ids: screen:0 -> 0, window:abc -> 6, window:def -> 12.
		const blameLine = "[Parsed_gfxcapture_12 @ 0x1234] Failed to find capture source";
		assert.deepEqual(plan.identifyFailures(blameLine), ["window:def"]);
	});

	it("returns no blame for log lines that don't match the capture-failure signatures", () => {
		const plan = windows.buildPlan([screenItem()]);
		assert.deepEqual(plan.identifyFailures("[Parsed_gfxcapture_0] frame=42 fps=2"), []);
		assert.deepEqual(plan.identifyFailures("[fc#0] Some other warning"), []);
	});

	it("ignores Parsed_gfxcapture ids that don't map to a known source", () => {
		const plan = windows.buildPlan([screenItem()]);
		// Only filter id 0 is mapped (1 source); id 99 must not be blamed.
		assert.deepEqual(plan.identifyFailures("[Parsed_gfxcapture_99] Failed to find capture source"), []);
	});

	it("does not partial-match Parsed_gfxcapture_3 against Parsed_gfxcapture_30", () => {
		const items = [
			screenItem({ source: { id: "screen:0", kind: "screen", name: "Primary" } }, "C:/tmp/screen.png"),
			windowItem({ source: { id: "window:abc", kind: "window", name: "Notepad" } }, "C:/tmp/notepad.png"),
		];
		const plan = windows.buildPlan(items);
		// Only ids 0 and 6 are mapped; 30 must not partial-match either.
		assert.deepEqual(plan.identifyFailures("[Parsed_gfxcapture_30] Failed to setup graphics capture"), []);
	});
});

describe("windows.buildProbePlan", () => {
	it("emits a single-source one-shot argv with -frames:v 1 and no -update flag", () => {
		const item = windowItem({}, "C:/tmp/probe.png");
		const plan = windows.buildProbePlan(item);
		assert.equal(typeof plan.identifyFailures, "function");
		assert.notEqual(plan.argv.indexOf("-frames:v"), -1);
		assert.equal(plan.argv[plan.argv.indexOf("-frames:v") + 1], "1");
		assert.equal(plan.argv.includes("-update"), false, "probe must not use -update streaming output");
		assert.equal(plan.argv.includes("-atomic_writing"), false);
		assert.equal(plan.argv[plan.argv.length - 1], "C:/tmp/probe.png");
		const filter = plan.argv[plan.argv.indexOf("-filter_complex") + 1];
		assert.equal(filter.split(";").length, 1, "probe must contain exactly one filter chain");
	});

	it("blames the probed source when it sees a gfxcapture init failure", () => {
		const plan = windows.buildProbePlan(windowItem({ sourceId: "window:bad" }, "C:/tmp/probe.png"));
		// Single-source probe means filter id 0 maps to the probed source.
		assert.deepEqual(plan.identifyFailures("[Parsed_gfxcapture_0 @ 0x1] Failed to find capture source"), ["window:bad"]);
		assert.deepEqual(plan.identifyFailures("[Parsed_gfxcapture_99 @ 0x1] Failed to find capture source"), []);
		assert.deepEqual(plan.identifyFailures("[Parsed_gfxcapture_0 @ 0x1] frame=1 fps=2"), []);
	});

	it("throws when called without a complete item", () => {
		assert.throws(() => windows.buildProbePlan(null));
		assert.throws(() => windows.buildProbePlan({ request: undefined, outputPath: "C:/tmp/x.png" }));
		assert.throws(() => windows.buildProbePlan({ request: windowItem().request }));
	});
});

describe("darwin.buildPlan / linux.buildPlan", () => {
	it("returns argv plus a no-op identifyFailures on darwin", () => {
		const plan = darwin.buildPlan([screenItem({}, "/tmp/a.png")]);
		assert.deepEqual(plan.argv, darwin.buildArgs([screenItem({}, "/tmp/a.png")]));
		assert.deepEqual(plan.identifyFailures("any line"), []);
	});

	it("returns argv plus a no-op identifyFailures on linux", () => {
		const plan = linux.buildPlan([screenItem({}, "/tmp/a.png")]);
		assert.deepEqual(plan.argv, linux.buildArgs([screenItem({}, "/tmp/a.png")]));
		assert.deepEqual(plan.identifyFailures("any line"), []);
	});
});

describe("darwin.buildArgs", () => {
	it("emits one avfoundation input per item with matching scale filters", () => {
		const args = darwin.buildArgs([screenItem({}, "/tmp/a.png"), screenItem({ source: { id: "screen:1", kind: "screen", name: "Display 1" } }, "/tmp/b.png")]);
		const inputIndices = args.reduce((acc, value, index) => {
			if (value === "-i") acc.push(index);
			return acc;
		}, []);
		assert.equal(inputIndices.length, 2);
		assert.equal(args[inputIndices[0] + 1], "0:none");
		assert.equal(args[inputIndices[1] + 1], "1:none");

		const filter = args[args.indexOf("-filter_complex") + 1];
		assert.match(filter, /\[0:v\]scale=iw\*0\.5:ih\*0\.5,fps=1\/1,format=rgba\[s0\]/);
		assert.match(filter, /\[1:v\]scale=iw\*0\.5:ih\*0\.5,fps=1\/1,format=rgba\[s1\]/);
	});

	it("falls back to screen index 0 for window sources", () => {
		const args = darwin.buildArgs([windowItem({}, "/tmp/w.png")]);
		assert.equal(args[args.indexOf("-i") + 1], "0:none");
	});
});

describe("linux.buildArgs", () => {
	it("emits an x11grab -i without bounds when none are provided", () => {
		const args = linux.buildArgs([screenItem({}, "/tmp/snap.png")]);
		assert.equal(args[args.indexOf("-f") + 1], "x11grab");
		const display = args[args.indexOf("-i") + 1];
		assert.ok(display.startsWith(":"));
		assert.equal(args.includes("-video_size"), false);
		const filter = args[args.indexOf("-filter_complex") + 1];
		assert.match(filter, /\[0:v\]scale=iw\*0\.5:ih\*0\.5/);
	});

	it("includes -video_size and offsets when source bounds are present", () => {
		const args = linux.buildArgs([
			windowItem(
				{
					source: { id: "window:abc", kind: "window", name: "Demo", bounds: { width: 800, height: 600, x: 100, y: 200 } },
				},
				"/tmp/snap.png"
			),
		]);
		assert.equal(args[args.indexOf("-video_size") + 1], "800x600");
		assert.match(args[args.indexOf("-i") + 1], /\+100,200$/);
	});
});
