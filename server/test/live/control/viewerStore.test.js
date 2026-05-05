import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { expect } = require("chai");

const { aggregateViewers, createViewerStore, effectiveDownlinkMbit } = await import("../../../src/live/control/viewerStore.js");

const buildViewer = (overrides = {}) => ({
	viewerId: overrides.viewerId || `viewer-${Math.random().toString(36).slice(2, 8)}`,
	codecs: overrides.codecs || {
		h264_high: { supported: true, smooth: true, powerEfficient: true },
		hevc_main: { supported: false, smooth: null, powerEfficient: null },
	},
	supportedCodecFamilies: overrides.supportedCodecFamilies || ["h264"],
	network: {
		downlinkMbit: 10,
		effectiveType: "4g",
		rttMs: 30,
		saveData: false,
		hlsBandwidthEstimateMbit: null,
		currentHlsLevel: null,
		...overrides.network,
	},
	display: {
		viewportWidth: 1920,
		viewportHeight: 1080,
		screenWidth: 1920,
		screenHeight: 1080,
		devicePixelRatio: 1,
		...overrides.display,
	},
	userAgent: overrides.userAgent || "test",
	probedAt: overrides.probedAt || Date.now(),
});

describe("effectiveDownlinkMbit", () => {
	it("prefers HLS bandwidth estimate when available", () => {
		const viewer = buildViewer({ network: { downlinkMbit: 100, hlsBandwidthEstimateMbit: 4 } });
		expect(effectiveDownlinkMbit(viewer)).to.equal(4);
	});

	it("falls back to navigator.connection downlink when hls estimate is missing", () => {
		const viewer = buildViewer({ network: { downlinkMbit: 25, hlsBandwidthEstimateMbit: null } });
		expect(effectiveDownlinkMbit(viewer)).to.equal(25);
	});

	it("returns 1.5 Mbit/s when saveData is on regardless of measured downlink", () => {
		const viewer = buildViewer({ network: { downlinkMbit: 50, saveData: true } });
		expect(effectiveDownlinkMbit(viewer)).to.equal(1.5);
	});

	it("returns null when no downlink signal is present", () => {
		const viewer = buildViewer({ network: { downlinkMbit: null, hlsBandwidthEstimateMbit: null } });
		expect(effectiveDownlinkMbit(viewer)).to.equal(null);
	});
});

describe("aggregateViewers", () => {
	it("computes minimum and median downlink across viewers", () => {
		const viewers = [
			buildViewer({ network: { hlsBandwidthEstimateMbit: 2 } }),
			buildViewer({ network: { hlsBandwidthEstimateMbit: 8 } }),
			buildViewer({ network: { hlsBandwidthEstimateMbit: 4 } }),
		];

		const summary = aggregateViewers(viewers, "session-1");
		expect(summary.viewerCount).to.equal(3);
		expect(summary.minDownlinkMbit).to.equal(2);
		expect(summary.medianDownlinkMbit).to.equal(4);
	});

	it("returns the intersection of supported codec families", () => {
		const viewers = [
			buildViewer({ supportedCodecFamilies: ["h264", "hevc"] }),
			buildViewer({ supportedCodecFamilies: ["h264", "av1"] }),
			buildViewer({ supportedCodecFamilies: ["h264"] }),
		];

		const summary = aggregateViewers(viewers, "session-1");
		expect(summary.supportedCodecs).to.deep.equal(["h264"]);
	});

	it("picks the largest viewport (DPR-adjusted) across viewers", () => {
		const viewers = [
			buildViewer({ display: { viewportWidth: 1280, viewportHeight: 720, devicePixelRatio: 1 } }),
			buildViewer({ display: { viewportWidth: 1920, viewportHeight: 1080, devicePixelRatio: 1 } }),
			buildViewer({ display: { viewportWidth: 800, viewportHeight: 600, devicePixelRatio: 2 } }),
		];

		const summary = aggregateViewers(viewers, "session-1");
		expect(summary.maxResolution).to.deep.equal({ w: 1920, h: 1080 });
	});

	it("handles empty viewer lists without throwing", () => {
		const summary = aggregateViewers([], "session-1");
		expect(summary.viewerCount).to.equal(0);
		expect(summary.minDownlinkMbit).to.equal(null);
		expect(summary.supportedCodecs).to.deep.equal([]);
	});
});

describe("createViewerStore", () => {
	it("removes a session when its last viewer disconnects", () => {
		const store = createViewerStore();
		store.upsertViewer("session-1", "socket-A", buildViewer());
		store.upsertViewer("session-1", "socket-B", buildViewer());
		store.upsertViewer("session-2", "socket-C", buildViewer());
		expect(store.sessionCount()).to.equal(2);

		store.removeViewer("session-1", "socket-A");
		expect(store.sessionCount()).to.equal(2);

		store.removeViewer("session-1", "socket-B");
		expect(store.sessionCount()).to.equal(1);
		expect(store.listViewerSnapshots("session-1")).to.deep.equal([]);
	});

	it("memoizes summaries until a viewer changes", () => {
		const store = createViewerStore();
		store.upsertViewer("session-1", "socket-A", buildViewer({ network: { hlsBandwidthEstimateMbit: 5 } }));
		const first = store.getSummary("session-1");
		const second = store.getSummary("session-1");
		expect(first).to.equal(second);

		store.upsertViewer("session-1", "socket-A", buildViewer({ network: { hlsBandwidthEstimateMbit: 3 } }));
		const third = store.getSummary("session-1");
		expect(third).to.not.equal(second);
		expect(third.minDownlinkMbit).to.equal(3);
	});
});
