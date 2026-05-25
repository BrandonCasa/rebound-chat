import { strict as assert } from "node:assert";
import { afterEach, beforeEach, describe, it } from "node:test";

import { SourceService, serializeSource } from "../service.js";

const makeNativeImage = (dataUrl, size = { width: 480, height: 270 }) => ({
	toDataURL: () => dataUrl,
	getSize: () => size,
});

const makeSource = ({ id, name = id, displayId, dataUrl = "data:image/png;base64,AAA", appIcon }) => ({
	id,
	name,
	display_id: displayId,
	thumbnail: makeNativeImage(dataUrl),
	appIcon: appIcon ? makeNativeImage(appIcon) : undefined,
});

class FakeDesktopCapturer {
	constructor() {
		this.calls = [];
		this.responseQueue = [];
		this.defaultSources = [];
	}

	queue(sources) {
		this.responseQueue.push(sources);
	}

	setDefault(sources) {
		this.defaultSources = sources;
	}

	async getSources(options) {
		this.calls.push(options);
		const next = this.responseQueue.length ? this.responseQueue.shift() : this.defaultSources;
		return Array.isArray(next) ? next : [];
	}
}

describe("serializeSource", () => {
	it("flattens a desktopCapturer source into the renderer-facing shape", () => {
		const result = serializeSource({
			id: "screen:0:0",
			name: "Display 0",
			display_id: "1234567",
			thumbnail: makeNativeImage("data:image/png;base64,XYZ", { width: 320, height: 180 }),
		});
		assert.deepEqual(result, {
			id: "screen:0:0",
			name: "Display 0",
			kind: "screen",
			displayId: "1234567",
			thumbnail: "data:image/png;base64,XYZ",
			thumbnailSize: { width: 320, height: 180 },
			appIcon: undefined,
		});
	});

	it("classifies anything not prefixed `screen` as a window", () => {
		const result = serializeSource({ id: "window:42:0", name: "Slack" });
		assert.equal(result.kind, "window");
		assert.equal(result.id, "window:42:0");
	});
});

describe("SourceService", () => {
	let service;
	let capturer;

	beforeEach(() => {
		capturer = new FakeDesktopCapturer();
	});

	afterEach(async () => {
		if (service) {
			await service.stop();
			service = null;
		}
	});

	const start = (overrides = {}) => {
		service = new SourceService({
			desktopCapturer: capturer,
			defaults: { intervalMs: 25, ...overrides },
		});
		return service.start();
	};

	it("rejects construction without a desktopCapturer", () => {
		assert.throws(() => new SourceService({}), TypeError);
	});

	it("listSources forwards normalized options to desktopCapturer", async () => {
		await start();
		capturer.queue([makeSource({ id: "screen:0:0" }), makeSource({ id: "window:1:0", name: "Editor" })]);

		const sources = await service.listSources({ types: ["bogus", "screen"], thumbnailSize: { width: 320, height: 180 } });

		assert.equal(capturer.calls.length, 1);
		assert.deepEqual(capturer.calls[0].types, ["screen"]);
		assert.deepEqual(capturer.calls[0].thumbnailSize, { width: 320, height: 180 });
		assert.equal(sources.length, 2);
		assert.equal(sources[0].kind, "screen");
		assert.equal(sources[1].kind, "window");
	});

	it("watch starts a poll loop and emits changed thumbnails", async () => {
		await start({ intervalMs: 5 });
		capturer.setDefault([makeSource({ id: "screen:0:0", dataUrl: "data:image/png;base64,A" })]);

		const events = [];
		service.onThumbnail((event) => events.push(event));
		const stop = service.watch([{ id: "screen:0:0" }]);

		await waitFor(() => events.length >= 1);

		assert.equal(events[0].sourceId, "screen:0:0");
		assert.equal(events[0].dataUrl, "data:image/png;base64,A");

		stop();
		assert.equal(service.subscriptions.size, 0);
	});

	it("ref-counts subscriptions so a duplicate watch keeps the source alive", async () => {
		await start({ intervalMs: 5 });
		capturer.setDefault([makeSource({ id: "window:1:0" })]);

		const stopA = service.watch([{ id: "window:1:0" }]);
		const stopB = service.watch([{ id: "window:1:0" }]);
		assert.equal(service.subscriptions.get("window:1:0"), 2);

		stopA();
		assert.equal(service.subscriptions.get("window:1:0"), 1);

		stopB();
		assert.equal(service.subscriptions.has("window:1:0"), false);
	});

	it("does not re-emit identical thumbnails", async () => {
		await start({ intervalMs: 5 });
		capturer.setDefault([makeSource({ id: "screen:0:0", dataUrl: "data:image/png;base64,SAME" })]);

		const events = [];
		service.onThumbnail((event) => events.push(event));
		const stop = service.watch([{ id: "screen:0:0" }]);

		await waitFor(() => events.length >= 1);
		const baseline = events.length;
		await sleep(40);
		assert.equal(events.length, baseline, "expected no extra events when the dataUrl did not change");

		stop();
	});

	it("emits a fresh event when the dataUrl changes", async () => {
		await start({ intervalMs: 5 });
		capturer.queue([makeSource({ id: "screen:0:0", dataUrl: "data:image/png;base64,FIRST" })]);
		capturer.queue([makeSource({ id: "screen:0:0", dataUrl: "data:image/png;base64,SECOND" })]);
		capturer.setDefault([makeSource({ id: "screen:0:0", dataUrl: "data:image/png;base64,SECOND" })]);

		const events = [];
		service.onThumbnail((event) => events.push(event));
		const stop = service.watch([{ id: "screen:0:0" }]);

		await waitFor(() => events.length >= 2);
		assert.equal(events[0].dataUrl, "data:image/png;base64,FIRST");
		assert.equal(events[1].dataUrl, "data:image/png;base64,SECOND");

		stop();
	});

	it("getCachedThumbnails returns the latest emit per id", async () => {
		await start({ intervalMs: 5 });
		capturer.setDefault([makeSource({ id: "screen:0:0", dataUrl: "data:image/png;base64,A" })]);

		const stop = service.watch([{ id: "screen:0:0" }]);
		await waitFor(() => service.getCachedThumbnails(["screen:0:0"]).length >= 1);

		const cached = service.getCachedThumbnails(["screen:0:0"]);
		assert.equal(cached.length, 1);
		assert.equal(cached[0].dataUrl, "data:image/png;base64,A");

		stop();
	});

	it("captureOnce resolves with the next event for the requested source", async () => {
		await start({ intervalMs: 1000 });
		capturer.setDefault([makeSource({ id: "screen:0:0", dataUrl: "data:image/png;base64,ONCE" })]);

		const event = await service.captureOnce({ id: "screen:0:0" }, { timeoutMs: 500 });
		assert.equal(event.sourceId, "screen:0:0");
		assert.equal(event.dataUrl, "data:image/png;base64,ONCE");
	});

	it("captureOnce rejects on timeout", async () => {
		await start({ intervalMs: 1000 });
		capturer.setDefault([]);

		await assert.rejects(service.captureOnce({ id: "missing" }, { timeoutMs: 30 }), /Timed out/);
	});

	it("listSources before start throws", async () => {
		service = new SourceService({ desktopCapturer: capturer });
		await assert.rejects(service.listSources(), /start\(\)/);
	});

	it("stop tears down the poll loop and clears state", async () => {
		await start({ intervalMs: 5 });
		capturer.setDefault([makeSource({ id: "screen:0:0" })]);
		service.watch([{ id: "screen:0:0" }]);
		await waitFor(() => capturer.calls.length >= 1);

		await service.stop();
		const baseline = capturer.calls.length;
		await sleep(30);
		assert.equal(capturer.calls.length, baseline, "expected no further desktopCapturer calls after stop");
		assert.equal(service.subscriptions.size, 0);
		service = null;
	});
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const waitFor = async (predicate, { timeoutMs = 500, intervalMs = 5 } = {}) => {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		if (predicate()) return;
		await sleep(intervalMs);
	}
	throw new Error("waitFor timed out");
};
