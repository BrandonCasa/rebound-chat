import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { expect } = require("chai");

const { aggregateViewers, createViewerStore, effectiveDownlinkMbit, samplePercentile, trimSamples, HISTORY_WINDOW_MS, MAX_SAMPLES } = await import(
	"../../../src/live/control/viewerStore.js"
);

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
		// Two samples exist for socket-A: [5, 3]. p25 = sorted[floor((2-1)*0.25)] = sorted[0] = 3.
		expect(third.minDownlinkMbit).to.equal(3);
	});
});

describe("samplePercentile", () => {
	it("returns null for empty inputs", () => {
		expect(samplePercentile([], 0.25)).to.equal(null);
		expect(samplePercentile(undefined, 0.25)).to.equal(null);
	});

	it("returns the only element when there is one sample", () => {
		expect(samplePercentile([7], 0.25)).to.equal(7);
		expect(samplePercentile([7], 0.99)).to.equal(7);
	});

	it("uses lower-percentile semantics (no interpolation) so picks land on real samples", () => {
		// [1, 2, 3, 4, 5] sorted; floor((5-1)*0.25) = floor(1) = 1 => second element.
		expect(samplePercentile([5, 3, 1, 2, 4], 0.25)).to.equal(2);
	});

	it("clamps the percentile to [0, 1]", () => {
		expect(samplePercentile([1, 2, 3], -0.5)).to.equal(1);
		expect(samplePercentile([1, 2, 3], 1.5)).to.equal(3);
	});
});

describe("trimSamples", () => {
	it("drops samples older than the window but keeps at least one", () => {
		const samples = [
			{ t: 0, mbit: 1 },
			{ t: 100, mbit: 2 },
			{ t: 200, mbit: 3 },
			{ t: 1000, mbit: 4 },
		];
		const now = 5000;
		const windowMs = 1000;
		trimSamples(samples, now, windowMs);
		expect(samples.length).to.equal(1);
		expect(samples[0].mbit).to.equal(4);
	});

	it("never empties the buffer even when every sample is older than the window", () => {
		const samples = [
			{ t: 0, mbit: 1 },
			{ t: 100, mbit: 2 },
		];
		trimSamples(samples, 100_000, 1_000);
		expect(samples.length).to.equal(1);
		expect(samples[0].mbit).to.equal(2);
	});

	it("enforces MAX_SAMPLES even when nothing is past the window", () => {
		const samples = [];
		for (let i = 0; i < MAX_SAMPLES + 5; i += 1) {
			samples.push({ t: i, mbit: i });
		}
		trimSamples(samples, MAX_SAMPLES + 5, 60_000);
		expect(samples.length).to.equal(MAX_SAMPLES);
		expect(samples[0].mbit).to.equal(5);
	});
});

describe("createViewerStore smoothing", () => {
	const buildAt = (t) => buildViewer({ network: { hlsBandwidthEstimateMbit: t } });

	const makeStore = () => {
		let clock = 1_000;
		const store = createViewerStore({ now: () => clock });
		return {
			store,
			advance: (ms) => {
				clock += ms;
			},
			at: () => clock,
		};
	};

	it("ignores a single high spike when previous samples were low", () => {
		const { store, advance } = makeStore();
		const sessionId = "session-spike";
		store.upsertViewer(sessionId, "socket-A", buildViewer({ network: { hlsBandwidthEstimateMbit: 2 } }));
		advance(1_000);
		store.upsertViewer(sessionId, "socket-A", buildViewer({ network: { hlsBandwidthEstimateMbit: 2 } }));
		advance(1_000);
		store.upsertViewer(sessionId, "socket-A", buildViewer({ network: { hlsBandwidthEstimateMbit: 2 } }));
		advance(1_000);
		store.upsertViewer(sessionId, "socket-A", buildViewer({ network: { hlsBandwidthEstimateMbit: 50 } }));
		const summary = store.getSummary(sessionId);
		// Samples are [2, 2, 2, 50]. p25 = sorted[floor((4-1)*0.25)] = sorted[0] = 2.
		expect(summary.minDownlinkMbit).to.equal(2);
	});

	it("raises the smoothed estimate once improvement holds across the bulk of the window", () => {
		const { store, advance } = makeStore();
		const sessionId = "session-rise";
		// Start with two low samples, then four high samples -> p25 of [2,2,8,8,8,8] = sorted[1] = 2.
		store.upsertViewer(sessionId, "socket-A", buildAt(2));
		advance(1_000);
		store.upsertViewer(sessionId, "socket-A", buildAt(2));
		advance(1_000);
		store.upsertViewer(sessionId, "socket-A", buildAt(8));
		advance(1_000);
		store.upsertViewer(sessionId, "socket-A", buildAt(8));
		advance(1_000);
		store.upsertViewer(sessionId, "socket-A", buildAt(8));
		advance(1_000);
		store.upsertViewer(sessionId, "socket-A", buildAt(8));
		expect(store.getSummary(sessionId).minDownlinkMbit).to.equal(2);

		// Once the low samples age out the buffer becomes [8, 8, 8, 8] -> p25 = 8.
		advance(HISTORY_WINDOW_MS);
		store.upsertViewer(sessionId, "socket-A", buildAt(8));
		expect(store.getSummary(sessionId).minDownlinkMbit).to.equal(8);
	});

	it("drops the smoothed estimate on the very next sample when bandwidth collapses", () => {
		const { store, advance } = makeStore();
		const sessionId = "session-drop";
		for (let i = 0; i < 6; i += 1) {
			store.upsertViewer(sessionId, "socket-A", buildAt(10));
			advance(1_000);
		}
		expect(store.getSummary(sessionId).minDownlinkMbit).to.equal(10);

		// One low sample is enough — the asymmetric `min(latest, p25)` aggregation drops
		// immediately on the latest sample even though the percentile is still 10.
		store.upsertViewer(sessionId, "socket-A", buildAt(2));
		expect(store.getSummary(sessionId).minDownlinkMbit).to.equal(2);
	});

	it("does not raise back up the moment one high sample arrives after a drop", () => {
		const { store, advance } = makeStore();
		const sessionId = "session-flap";
		for (let i = 0; i < 4; i += 1) {
			store.upsertViewer(sessionId, "socket-A", buildAt(2));
			advance(1_000);
		}
		// One high spike arrives. p25 is still 2 (most of the buffer is 2), so
		// min(latest=20, p25=2) = 2. We do NOT raise the estimate.
		store.upsertViewer(sessionId, "socket-A", buildAt(20));
		expect(store.getSummary(sessionId).minDownlinkMbit).to.equal(2);
	});

	it("uses the worst smoothed viewer for minDownlink across multiple viewers", () => {
		const { store, advance } = makeStore();
		const sessionId = "session-multi";
		for (let i = 0; i < 4; i += 1) {
			store.upsertViewer(sessionId, "socket-fast", buildAt(50));
			store.upsertViewer(sessionId, "socket-slow", buildAt(2));
			advance(1_000);
		}
		const summary = store.getSummary(sessionId);
		expect(summary.viewerCount).to.equal(2);
		expect(summary.minDownlinkMbit).to.equal(2);
	});

	it("retains the last sample even after the window has fully expired (silent viewer)", () => {
		const { store, advance } = makeStore();
		const sessionId = "session-silent";
		store.upsertViewer(sessionId, "socket-A", buildAt(3));
		advance(HISTORY_WINDOW_MS * 5);
		// No new upsert -> dirty flag is false, summary is memoized at the original value.
		// Force a rebuild by changing another socket's state and reading.
		store.upsertViewer(sessionId, "socket-B", buildAt(20));
		const summary = store.getSummary(sessionId);
		expect(summary.viewerCount).to.equal(2);
		// Silent viewer's last known value is still 3 — that is the worst link.
		expect(summary.minDownlinkMbit).to.equal(3);
	});

	it("short-circuits to 1.5 Mbit when saveData is on regardless of history", () => {
		const { store } = makeStore();
		const sessionId = "session-savedata";
		store.upsertViewer(sessionId, "socket-A", buildViewer({ network: { hlsBandwidthEstimateMbit: 50 } }));
		store.upsertViewer(sessionId, "socket-A", buildViewer({ network: { hlsBandwidthEstimateMbit: 50, saveData: true } }));
		expect(store.getSummary(sessionId).minDownlinkMbit).to.equal(1.5);
	});

	it("does not bleed history across sockets", () => {
		const { store, advance } = makeStore();
		const sessionId = "session-isolate";
		for (let i = 0; i < 6; i += 1) {
			store.upsertViewer(sessionId, "socket-A", buildAt(2));
			advance(500);
		}
		// New socket appears with a high reading. Its history is empty, so the percentile is just
		// that single value — but the OTHER socket is still on a low estimate, so the session min
		// stays low.
		store.upsertViewer(sessionId, "socket-B", buildAt(80));
		const summary = store.getSummary(sessionId);
		expect(summary.minDownlinkMbit).to.equal(2);
		expect(store.getViewerSampleCount(sessionId, "socket-A")).to.be.greaterThan(1);
		expect(store.getViewerSampleCount(sessionId, "socket-B")).to.equal(1);
	});

	it("forgets a viewer's samples when they disconnect", () => {
		const { store, advance } = makeStore();
		const sessionId = "session-forget";
		for (let i = 0; i < 4; i += 1) {
			store.upsertViewer(sessionId, "socket-slow", buildAt(2));
			advance(500);
		}
		expect(store.getSummary(sessionId).minDownlinkMbit).to.equal(2);

		store.removeViewer(sessionId, "socket-slow");
		// Empty session => null minDownlink.
		const summary = store.getSummary(sessionId);
		expect(summary.viewerCount).to.equal(0);
		expect(summary.minDownlinkMbit).to.equal(null);

		// Re-add with the same socketId — history must be fresh, not whatever we stored before.
		store.upsertViewer(sessionId, "socket-slow", buildAt(50));
		expect(store.getSummary(sessionId).minDownlinkMbit).to.equal(50);
	});
});
