import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { expect } = require("chai");

const { createControlSession, recommendationDirection } = await import("../../../src/live/control/controlSession.js");

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const recommendationsFrom = (events) => events.filter((event) => event.envelope.type === "recommended-settings");
const viewerAdaptingFrom = (events) => events.filter((event) => event.scope === "viewers" && event.envelope.type === "streamer-adapting-broadcast");

const buildCapabilities = (overrides = {}) => ({
	viewerId: overrides.viewerId || "viewer",
	codecs: {},
	supportedCodecFamilies: overrides.supportedCodecFamilies || ["h264"],
	network: {
		downlinkMbit: 10,
		hlsBandwidthEstimateMbit: null,
		saveData: false,
		effectiveType: "4g",
		rttMs: 30,
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
	userAgent: "test",
	probedAt: Date.now(),
});

const buildCeiling = () => ({
	videoBitrate: 8_000_000,
	videoCodec: "h264_nvenc",
	outputWidth: 1920,
	outputHeight: 1080,
	fps: 60,
	createdAt: Date.now(),
});

describe("controlSession push behaviour", () => {
	let emitted;
	let emit;
	let session;

	beforeEach(() => {
		emitted = [];
		emit = (event) => emitted.push(event);
		session = createControlSession({ sessionId: "session-1", emit, log: null });
	});

	it("pushes summary + recommendation when streamer attaches", () => {
		const result = session.attachStreamer("streamer-1", {
			initialCeiling: buildCeiling(),
			currentSettings: { videoBitrate: "8M" },
			autoAdapt: true,
		});

		const recommendationEvents = emitted.filter((event) => event.envelope.type === "recommended-settings");
		expect(recommendationEvents).to.have.lengthOf(1);
		expect(recommendationEvents[0].envelope.derivedFromViewerCount).to.equal(0);
		expect(result.recommendation).to.exist;
	});

	it("respects auto-adapt off — no recommendations leak", () => {
		session.attachStreamer("streamer-1", {
			initialCeiling: buildCeiling(),
			currentSettings: null,
			autoAdapt: false,
		});

		emitted.length = 0;
		session.upsertViewer("viewer-A", buildCapabilities({ network: { hlsBandwidthEstimateMbit: 1 } }));

		const recommendationEvents = emitted.filter((event) => event.envelope.type === "recommended-settings");
		expect(recommendationEvents).to.have.lengthOf(0);
		const summaryEvents = emitted.filter((event) => event.envelope.type === "viewer-summary");
		expect(summaryEvents.length).to.be.greaterThan(0);
	});

	it("re-engages adaptation when toggled back on", () => {
		session.attachStreamer("streamer-1", {
			initialCeiling: buildCeiling(),
			currentSettings: null,
			autoAdapt: false,
		});
		session.upsertViewer("viewer-A", buildCapabilities({ network: { hlsBandwidthEstimateMbit: 2 } }));

		emitted.length = 0;
		session.setAutoAdapt("streamer-1", true);
		const recommendationEvents = emitted.filter((event) => event.envelope.type === "recommended-settings");
		expect(recommendationEvents).to.have.lengthOf(1);
	});

	it("teardown does not throw even when timers were scheduled", () => {
		session.attachStreamer("streamer-1", {
			initialCeiling: buildCeiling(),
			currentSettings: null,
			autoAdapt: true,
		});
		session.upsertViewer("viewer-A", buildCapabilities({ network: { hlsBandwidthEstimateMbit: 4 } }));
		session.upsertViewer("viewer-A", buildCapabilities({ network: { hlsBandwidthEstimateMbit: 1 } }));
		expect(() => session.teardown()).to.not.throw();
	});
});

describe("recommendationDirection", () => {
	const baseRec = {
		videoBitrate: 4_000_000,
		videoCodec: "h264_nvenc",
		outputWidth: 1280,
		outputHeight: 720,
		fps: 60,
	};

	it("returns 'same' when there is no previous recommendation", () => {
		expect(recommendationDirection(null, baseRec)).to.equal("same");
	});

	it("returns 'up' when any numeric field rises and none fall", () => {
		const next = { ...baseRec, videoBitrate: 8_000_000, outputWidth: 1920, outputHeight: 1080 };
		expect(recommendationDirection(baseRec, next)).to.equal("up");
	});

	it("returns 'down' when any numeric field falls", () => {
		const next = { ...baseRec, videoBitrate: 2_000_000 };
		expect(recommendationDirection(baseRec, next)).to.equal("down");
	});

	it("returns 'down' for mixed up/down moves so cuts are never delayed", () => {
		const next = { ...baseRec, videoBitrate: 8_000_000, outputHeight: 540 };
		expect(recommendationDirection(baseRec, next)).to.equal("down");
	});

	it("classifies codec promotion (h264 → av1) as 'up'", () => {
		const next = { ...baseRec, videoCodec: "av1_nvenc" };
		expect(recommendationDirection(baseRec, next)).to.equal("up");
	});

	it("classifies codec demotion (h264 → vp9) as 'down'", () => {
		const next = { ...baseRec, videoCodec: "libvpx-vp9" };
		expect(recommendationDirection(baseRec, next)).to.equal("down");
	});
});

describe("controlSession raise hysteresis", () => {
	const RAISE_DWELL = 60;
	let emitted;
	let session;

	beforeEach(() => {
		emitted = [];
		session = createControlSession({
			sessionId: "session-raise",
			emit: (event) => emitted.push(event),
			log: null,
			raiseDwellMs: RAISE_DWELL,
			minIntervalMs: 0,
		});
	});

	afterEach(() => session.teardown());

	const attach = () =>
		session.attachStreamer("streamer-1", {
			initialCeiling: buildCeiling(),
			currentSettings: null,
			autoAdapt: true,
		});

	it("downgrades push immediately when a slow viewer joins", async () => {
		attach();
		emitted.length = 0;
		session.upsertViewer("viewer-slow", buildCapabilities({ network: { hlsBandwidthEstimateMbit: 1.2 } }));
		const recs = recommendationsFrom(emitted);
		expect(recs).to.have.lengthOf(1);
		expect(recs[0].envelope.videoBitrate).to.be.lessThan(8_000_000);
		expect(session.hasPendingRaise()).to.equal(false);
	});

	it("delays an upward recommendation until the dwell window elapses", async () => {
		attach();
		session.upsertViewer("viewer-slow", buildCapabilities({ network: { hlsBandwidthEstimateMbit: 1.2 } }));
		emitted.length = 0;

		session.removeViewer("viewer-slow");
		expect(session.hasPendingRaise()).to.equal(true, "raise should be pending immediately after the slow viewer leaves");
		expect(recommendationsFrom(emitted)).to.have.lengthOf(0, "nothing should be pushed during the dwell");

		await wait(RAISE_DWELL + 30);

		const recs = recommendationsFrom(emitted);
		expect(session.hasPendingRaise()).to.equal(false);
		expect(recs).to.have.lengthOf(1, "exactly one promotion push should arrive after the dwell");
		expect(recs[0].envelope.videoBitrate).to.equal(8_000_000);
		expect(recs[0].envelope.derivedFromViewerCount).to.equal(0);
	});

	it("cancels a pending raise when a fresh slow viewer joins during the dwell", async () => {
		attach();
		session.upsertViewer("viewer-slow", buildCapabilities({ network: { hlsBandwidthEstimateMbit: 1.2 } }));
		emitted.length = 0;

		session.removeViewer("viewer-slow");
		expect(session.hasPendingRaise()).to.equal(true);

		await wait(Math.floor(RAISE_DWELL / 2));
		session.upsertViewer("viewer-also-slow", buildCapabilities({ network: { hlsBandwidthEstimateMbit: 0.6 } }));
		expect(session.hasPendingRaise()).to.equal(false, "a downward signal must clear the pending raise");

		// The newly-pushed downgrade is the only recommendation that should
		// arrive — the dwell-fired raise must NOT be pushed afterwards.
		const downRecs = recommendationsFrom(emitted);
		expect(downRecs.length).to.be.greaterThanOrEqual(1);
		expect(downRecs[downRecs.length - 1].envelope.videoBitrate).to.be.lessThan(8_000_000);

		emitted.length = 0;
		await wait(RAISE_DWELL + 30);
		expect(recommendationsFrom(emitted)).to.have.lengthOf(0, "no raise should fire after a slow viewer rejoined");
	});

	it("does not stack raise timers when multiple ups arrive during the dwell", async () => {
		attach();
		session.upsertViewer("viewer-slow", buildCapabilities({ network: { hlsBandwidthEstimateMbit: 1.2 } }));
		emitted.length = 0;

		session.removeViewer("viewer-slow");
		// A faster viewer joining nudges the recommendation slightly higher
		// (still up) — must not reset / duplicate the pending timer.
		session.upsertViewer("viewer-fast", buildCapabilities({ network: { hlsBandwidthEstimateMbit: 80 } }));
		expect(session.hasPendingRaise()).to.equal(true);

		await wait(RAISE_DWELL + 30);
		expect(recommendationsFrom(emitted)).to.have.lengthOf(1, "exactly one raise push should fire");
	});

	it("force-bypasses a pending raise when the streamer re-attaches", () => {
		attach();
		session.upsertViewer("viewer-slow", buildCapabilities({ network: { hlsBandwidthEstimateMbit: 1.2 } }));
		session.removeViewer("viewer-slow");
		expect(session.hasPendingRaise()).to.equal(true, "raise pending after the slow viewer left");
		emitted.length = 0;

		// A re-attach is a force push — it must clear the pending raise
		// and emit the current recommendation synchronously, regardless of
		// direction.
		session.attachStreamer("streamer-2", {
			initialCeiling: buildCeiling(),
			currentSettings: null,
			autoAdapt: true,
		});
		expect(session.hasPendingRaise()).to.equal(false);
		const recs = recommendationsFrom(emitted);
		expect(recs.length).to.be.greaterThanOrEqual(1);
		expect(recs[recs.length - 1].envelope.videoBitrate).to.equal(8_000_000);
	});

	it("stays at the demoted state when the dwell elapses but conditions did not actually improve", async () => {
		attach();
		session.upsertViewer("viewer-slow-A", buildCapabilities({ network: { hlsBandwidthEstimateMbit: 1.2 } }));
		emitted.length = 0;

		// Pretend a viewer leaves and is replaced by an equally-poor one
		// before the recommender ever recomputes a higher target.
		session.removeViewer("viewer-slow-A");
		session.upsertViewer("viewer-slow-B", buildCapabilities({ network: { hlsBandwidthEstimateMbit: 1.2 } }));
		await wait(RAISE_DWELL + 30);

		// The recommender should see the same demoted target as before
		// and decline to push anything new.
		expect(recommendationsFrom(emitted).length).to.equal(0, "no push when conditions never actually improved");
	});

	it("clears any pending raise when teardown is called", async () => {
		attach();
		session.upsertViewer("viewer-slow", buildCapabilities({ network: { hlsBandwidthEstimateMbit: 1.2 } }));
		session.removeViewer("viewer-slow");
		expect(session.hasPendingRaise()).to.equal(true);
		session.teardown();
		await wait(RAISE_DWELL + 30);
		expect(session.hasPendingRaise()).to.equal(false);
	});
});

describe("controlSession adapting fan-out", () => {
	const ADAPT_TIMEOUT = 60;
	let emitted;
	let session;

	beforeEach(() => {
		emitted = [];
		session = createControlSession({
			sessionId: "session-adapt",
			emit: (event) => emitted.push(event),
			log: null,
			raiseDwellMs: 0,
			minIntervalMs: 0,
			adaptingTimeoutMs: ADAPT_TIMEOUT,
		});
	});

	afterEach(() => session.teardown());

	const attachWithStreamer = () =>
		session.attachStreamer("streamer-1", {
			initialCeiling: buildCeiling(),
			currentSettings: null,
			autoAdapt: true,
		});

	it("fans out a pending broadcast to viewers whenever a recommendation is pushed", () => {
		attachWithStreamer();
		emitted.length = 0;

		session.upsertViewer("viewer-slow", buildCapabilities({ network: { hlsBandwidthEstimateMbit: 1.2 } }));

		const recs = recommendationsFrom(emitted);
		const adaptingPushes = viewerAdaptingFrom(emitted);
		expect(recs).to.have.lengthOf(1, "recommendation must reach the streamer");
		expect(adaptingPushes).to.have.lengthOf(1, "viewers must hear about the adapting state");
		const envelope = adaptingPushes[0].envelope;
		expect(envelope.state).to.equal("pending");
		expect(envelope.target.videoBitrate).to.equal(recs[0].envelope.videoBitrate);
		expect(envelope.direction).to.equal("down");
		expect(envelope.derivedFromViewerCount).to.equal(1);
		expect(session.hasPendingAdaptation()).to.equal(true);
	});

	it("does NOT fan out adapting state when no streamer is attached to receive the recommendation", () => {
		// No `attachStreamer` — viewers connecting in this state would
		// see "host adjusting" with nobody actually adjusting anything,
		// which is misleading and distressing.
		emitted.length = 0;
		session.upsertViewer("viewer-A", buildCapabilities({ network: { hlsBandwidthEstimateMbit: 4 } }));

		expect(viewerAdaptingFrom(emitted)).to.have.lengthOf(0);
		expect(session.hasPendingAdaptation()).to.equal(false);
	});

	it("clears the adapting state for viewers as soon as the streamer acks", () => {
		attachWithStreamer();
		session.upsertViewer("viewer-slow", buildCapabilities({ network: { hlsBandwidthEstimateMbit: 1.2 } }));
		expect(session.hasPendingAdaptation()).to.equal(true);
		emitted.length = 0;

		session.ackRecommendation("streamer-1", { applied: true, actualSettings: null, clampedBy: null, reason: "", ackId: "ack-1" });

		const cleared = viewerAdaptingFrom(emitted).filter((event) => event.envelope.state === "cleared");
		expect(cleared).to.have.lengthOf(1, "ack must trigger a cleared broadcast");
		expect(session.hasPendingAdaptation()).to.equal(false);
	});

	it("clears adapting state via the safety timeout when the streamer never acks", async () => {
		attachWithStreamer();
		session.upsertViewer("viewer-slow", buildCapabilities({ network: { hlsBandwidthEstimateMbit: 1.2 } }));
		expect(session.hasPendingAdaptation()).to.equal(true);
		emitted.length = 0;

		await wait(ADAPT_TIMEOUT + 30);

		const cleared = viewerAdaptingFrom(emitted).filter((event) => event.envelope.state === "cleared");
		expect(cleared.length).to.be.greaterThanOrEqual(1, "timeout must fan a cleared broadcast");
		expect(cleared[cleared.length - 1].envelope.reason).to.equal("timeout");
		expect(session.hasPendingAdaptation()).to.equal(false);
	});

	it("clears adapting state when the streamer detaches mid-respawn", () => {
		attachWithStreamer();
		session.upsertViewer("viewer-slow", buildCapabilities({ network: { hlsBandwidthEstimateMbit: 1.2 } }));
		expect(session.hasPendingAdaptation()).to.equal(true);
		emitted.length = 0;

		session.detachStreamer("streamer-1", { reason: "transport_close" });

		const cleared = viewerAdaptingFrom(emitted).filter((event) => event.envelope.state === "cleared");
		expect(cleared).to.have.lengthOf(1);
		expect(cleared[0].envelope.reason).to.contain("streamer_detached");
		expect(session.hasPendingAdaptation()).to.equal(false);
	});

	it("exposes the in-flight snapshot for late-joining viewer HELLOs", () => {
		attachWithStreamer();
		session.upsertViewer("viewer-slow", buildCapabilities({ network: { hlsBandwidthEstimateMbit: 1.2 } }));

		const snapshot = session.getAdaptingSnapshot();
		expect(snapshot).to.not.equal(null);
		expect(snapshot.state).to.equal("pending");
		expect(snapshot.target).to.have.property("videoBitrate");
		expect(snapshot.direction).to.equal("down");
	});

	it("returns null from getAdaptingSnapshot once the streamer has acked the in-flight push", () => {
		// `attachStreamer` itself force-pushes a recommendation (the
		// ceiling-restoration baseline), so the snapshot is non-null
		// immediately after attach. The steady-state assertion is "ack
		// then null", not "attach then null".
		attachWithStreamer();
		expect(session.getAdaptingSnapshot()).to.not.equal(null);
		session.ackRecommendation("streamer-1", { applied: false, actualSettings: null, clampedBy: null, reason: "no-op", ackId: "ack-attach" });
		expect(session.getAdaptingSnapshot()).to.equal(null);
	});
});
