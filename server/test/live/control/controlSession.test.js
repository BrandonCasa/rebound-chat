import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { expect } = require("chai");

const { createControlSession } = await import("../../../src/live/control/controlSession.js");

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
