import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { expect } = require("chai");

const { aggregateViewers } = await import("../../../src/live/control/viewerStore.js");
const { buildRecommendation, codecFamilyOf, isMeaningfulChange, snapToLadder } = await import("../../../src/live/control/recommender.js");

const buildCeiling = (overrides = {}) => ({
	videoBitrate: 8_000_000,
	videoCodec: "h264_nvenc",
	outputWidth: 1920,
	outputHeight: 1080,
	fps: 60,
	createdAt: 1700000000000,
	...overrides,
});

const buildViewer = (overrides = {}) => ({
	viewerId: overrides.viewerId || `viewer-${Math.random().toString(36).slice(2, 8)}`,
	codecs: overrides.codecs || {},
	supportedCodecFamilies: overrides.supportedCodecFamilies || ["h264"],
	network: {
		downlinkMbit: 25,
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

describe("snapToLadder", () => {
	it("snaps to the largest ladder step <= input", () => {
		expect(snapToLadder(700)).to.equal(540);
		expect(snapToLadder(720)).to.equal(720);
		expect(snapToLadder(900)).to.equal(900);
		expect(snapToLadder(1080)).to.equal(1080);
		expect(snapToLadder(2200)).to.equal(2160);
	});

	it("returns the smallest ladder step for sub-360 inputs", () => {
		expect(snapToLadder(50)).to.equal(360);
	});
});

describe("codecFamilyOf", () => {
	it("classifies common encoders", () => {
		expect(codecFamilyOf("h264_nvenc")).to.equal("h264");
		expect(codecFamilyOf("hevc_qsv")).to.equal("hevc");
		expect(codecFamilyOf("av1_amf")).to.equal("av1");
		expect(codecFamilyOf("libvpx-vp9")).to.equal("vp9");
		expect(codecFamilyOf("libsvtav1")).to.equal("av1");
		expect(codecFamilyOf("libx264")).to.equal("h264");
	});

	it("returns null for unknown inputs", () => {
		expect(codecFamilyOf("???")).to.equal(null);
		expect(codecFamilyOf(undefined)).to.equal(null);
	});
});

describe("buildRecommendation", () => {
	it("caps the recommended bitrate at the ceiling", () => {
		const viewers = [buildViewer({ network: { hlsBandwidthEstimateMbit: 50 } })];
		const summary = aggregateViewers(viewers, "session-1");
		const ceiling = buildCeiling({ videoBitrate: 4_000_000 });
		const result = buildRecommendation({
			sessionId: "session-1",
			summary,
			viewerSnapshots: viewers,
			ceiling,
		});
		expect(result.videoBitrate).to.equal(4_000_000);
	});

	it("scales bitrate down for slow viewers", () => {
		const viewers = [buildViewer({ network: { hlsBandwidthEstimateMbit: 4 } }), buildViewer({ network: { hlsBandwidthEstimateMbit: 20 } })];
		const summary = aggregateViewers(viewers, "session-1");
		const ceiling = buildCeiling();
		const result = buildRecommendation({
			sessionId: "session-1",
			summary,
			viewerSnapshots: viewers,
			ceiling,
		});
		expect(result.videoBitrate).to.be.at.most(4_000_000 * 0.7 * 0.8 + 1);
		expect(result.reason).to.match(/worst viewer/);
	});

	it("demotes the codec when no viewer can decode the ceiling family", () => {
		const viewers = [buildViewer({ supportedCodecFamilies: ["h264"] })];
		const summary = aggregateViewers(viewers, "session-1");
		const ceiling = buildCeiling({ videoCodec: "av1_nvenc" });
		const result = buildRecommendation({
			sessionId: "session-1",
			summary,
			viewerSnapshots: viewers,
			ceiling,
		});
		expect(result.videoCodec).to.equal("h264_nvenc");
	});

	it("snaps resolution to the ladder of the largest viewer viewport", () => {
		const viewers = [buildViewer({ display: { viewportWidth: 800, viewportHeight: 600, devicePixelRatio: 1 } })];
		const summary = aggregateViewers(viewers, "session-1");
		const ceiling = buildCeiling();
		const result = buildRecommendation({
			sessionId: "session-1",
			summary,
			viewerSnapshots: viewers,
			ceiling,
		});
		expect(result.outputHeight).to.equal(540);
	});

	it("drops fps only when every viewer is on slow-2g/2g", () => {
		const viewers = [
			buildViewer({ network: { effectiveType: "slow-2g", hlsBandwidthEstimateMbit: 0.5 } }),
			buildViewer({ network: { effectiveType: "2g", hlsBandwidthEstimateMbit: 0.7 } }),
		];
		const summary = aggregateViewers(viewers, "session-1");
		const ceiling = buildCeiling();
		const result = buildRecommendation({
			sessionId: "session-1",
			summary,
			viewerSnapshots: viewers,
			ceiling,
		});
		expect(result.fps).to.equal(30);
	});

	it("restores ceiling when no viewers are connected", () => {
		const summary = aggregateViewers([], "session-1");
		const ceiling = buildCeiling();
		const result = buildRecommendation({
			sessionId: "session-1",
			summary,
			viewerSnapshots: [],
			ceiling,
		});
		expect(result.videoBitrate).to.equal(ceiling.videoBitrate);
		expect(result.videoCodec).to.equal(ceiling.videoCodec);
		expect(result.reason).to.match(/no viewers/);
	});
});

describe("isMeaningfulChange", () => {
	it("returns true when codec changes", () => {
		const previous = { videoBitrate: 5_000_000, videoCodec: "h264_nvenc" };
		const next = { videoBitrate: 5_000_000, videoCodec: "av1_nvenc" };
		expect(isMeaningfulChange(previous, next)).to.equal(true);
	});

	it("returns false for sub-10% bitrate change", () => {
		const previous = { videoBitrate: 5_000_000, videoCodec: "h264_nvenc" };
		const next = { videoBitrate: 5_300_000, videoCodec: "h264_nvenc" };
		expect(isMeaningfulChange(previous, next)).to.equal(false);
	});

	it("returns true for >10% bitrate change", () => {
		const previous = { videoBitrate: 5_000_000, videoCodec: "h264_nvenc" };
		const next = { videoBitrate: 4_000_000, videoCodec: "h264_nvenc" };
		expect(isMeaningfulChange(previous, next)).to.equal(true);
	});

	it("returns true the first time we have a recommendation", () => {
		expect(isMeaningfulChange(null, { videoBitrate: 1_000_000, videoCodec: "h264_nvenc" })).to.equal(true);
	});
});
