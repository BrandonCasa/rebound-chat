import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { expect } = require("chai");

const { aggregateViewers } = await import("../../../src/live/control/viewerStore.js");
const { buildRecommendation, codecFamilyOf, isMeaningfulChange, snapToLadder, recommendBitrate, parseBitrateValueToBps, ABSOLUTE_FLOOR_BPS } = await import(
	"../../../src/live/control/recommender.js"
);

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
		loadFractionAvg: null,
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

	it("never drops fps below the ceiling, even for slow-2g/2g viewers", () => {
		// Frame-rate drops are far more visually jarring than bitrate
		// drops, so the recommender always pins fps at the ceiling and
		// lets the bitrate/resolution/codec heuristics do the work for
		// bandwidth-starved viewers.
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
		expect(result.fps).to.equal(ceiling.fps);
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

describe("recommendBitrate ABR death-spiral guard", () => {
	const ceiling = { videoBitrate: 8_000_000 };

	it("holds at currentBps when downlink is in the inconclusive zone (≈ encoded rate)", () => {
		// Streamer is currently encoding at 4 Mbps. hls.js reports a
		// downlink of ~4 Mbit/s — exactly what we sent it. That is the
		// upper-bound artefact: the EWMA cannot see capacity above
		// what we asked for. We must NOT drop further on this signal.
		const result = recommendBitrate({
			minDownlinkMbit: 4,
			ceiling,
			currentBps: 4_000_000,
		});
		expect(result).to.equal(4_000_000, "the recommendation must hold at the current encoded rate");
	});

	it("holds at currentBps even when downlink is slightly below current (still inconclusive)", () => {
		// 90% of currentBps is still inside the INCONCLUSIVE_RATIO=0.85
		// zone. Without this gate, every downward step compounds: the
		// next measurement is pinned at the new lower rate, justifying
		// another step, ad infinitum.
		const result = recommendBitrate({
			minDownlinkMbit: 3.6,
			ceiling,
			currentBps: 4_000_000,
		});
		expect(result).to.equal(4_000_000);
	});

	it("DOES drop when downlink is convincingly below current (real congestion)", () => {
		// 50% of currentBps is well below the inconclusive threshold —
		// the link genuinely cannot deliver what we are sending. The
		// drop is allowed; the resulting target is the bandwidth-based
		// candidate, clamped at the ceiling.
		const result = recommendBitrate({
			minDownlinkMbit: 2,
			ceiling,
			currentBps: 4_000_000,
		});
		const expectedCandidate = Math.round(2_000_000 * 0.7 * 0.8);
		expect(result).to.equal(expectedCandidate);
		expect(result).to.be.lessThan(4_000_000);
	});

	it("waives the hold when load fraction reports real congestion", () => {
		// Bandwidth estimate alone says "inconclusive" (downlink ≈
		// currentBps), but the load-fraction signal is clearly in the
		// congested zone — segments are barely keeping up with their
		// playable duration. The drop should still apply.
		const result = recommendBitrate({
			minDownlinkMbit: 4,
			ceiling,
			currentBps: 4_000_000,
			maxLoadFraction: 0.95,
		});
		expect(result).to.be.lessThan(4_000_000);
	});

	it("aims for ceiling when load fraction reports clear headroom", () => {
		// This is the "escape from the death-spiral floor" path. The
		// bandwidth estimate is pinned near currentBps (because hls.js
		// can't see beyond what we send), but load fraction is well
		// below 0.4 — every viewer's segments arrive in a small slice
		// of their playable duration. The recommender is allowed to
		// climb back toward ceiling; the controlSession's raise dwell
		// throttles the actual respawn rate.
		const result = recommendBitrate({
			minDownlinkMbit: 4,
			ceiling,
			currentBps: 4_000_000,
			maxLoadFraction: 0.15,
		});
		expect(result).to.equal(8_000_000);
	});

	it("falls back to legacy behaviour when currentBps is unknown (no spiral guard)", () => {
		// Older streamers don't pass currentSettings, so currentBps is
		// null. The recommender then behaves exactly as before this
		// fix landed: candidate = downlink * 0.56, clamped at ceiling.
		const result = recommendBitrate({
			minDownlinkMbit: 4,
			ceiling,
		});
		expect(result).to.equal(Math.round(4_000_000 * 0.7 * 0.8));
	});

	it("never lets the recommendation collapse below ABSOLUTE_FLOOR_BPS", () => {
		// Pathological: link genuinely returns ~50 kbit/s. We still
		// floor at 500 kbit/s so the player has *something* to chew on
		// rather than a literally unplayable bitrate.
		const result = recommendBitrate({
			minDownlinkMbit: 0.05,
			ceiling,
			currentBps: 1_000_000,
		});
		expect(result).to.equal(ABSOLUTE_FLOOR_BPS);
	});
});

describe("recommendBitrate end-to-end spiral simulation", () => {
	// Simulates the failure mode the user originally hit: the streamer
	// drops, hls.js's bandwidthEstimate clamps to the new (lower)
	// segment size, the recommender drops again, and so on until the
	// floor. With the inconclusive-zone gate in place, the system is
	// supposed to converge to a fixed point at the very first drop and
	// stay there until either congestion clears (load fraction
	// recovers) or worsens.
	const ceiling = { videoBitrate: 8_000_000 };

	it("converges to a fixed point instead of ratcheting to the floor", () => {
		// Initial state: encoding at ceiling 8M, viewer reports ~5
		// Mbit/s (real link is ~10 Mbit/s but bw estimate is bounded).
		// First drop is justified — that is a real signal that 8M is
		// too much. Steady-state after the drop, the bw estimate is
		// pinned near the new rate, but we must NOT keep dropping.
		let currentBps = ceiling.videoBitrate;

		// Iterate the loop the way the live system does. With the
		// guard, we expect the system to make exactly one drop and
		// then stabilise.
		const history = [currentBps];
		for (let i = 0; i < 8; i += 1) {
			// Each iteration the viewer's bw estimate is "what the
			// streamer sent it last", scaled by 0.95 to model TTFB
			// overhead — the canonical death-spiral input.
			const observedDownlinkMbit = (currentBps / 1_000_000) * 0.95;
			const next = recommendBitrate({
				minDownlinkMbit: observedDownlinkMbit,
				ceiling,
				currentBps,
			});
			currentBps = next;
			history.push(currentBps);
		}

		// Expectation: the bitrate falls at most once and then holds.
		const distinctValues = new Set(history);
		expect(distinctValues.size).to.be.at.most(2, `bitrate must not ratchet downward; history: ${history.join(" → ")}`);
		expect(currentBps).to.be.greaterThan(ABSOLUTE_FLOOR_BPS, "must never collapse to the floor on a healthy link");
	});
});

describe("parseBitrateValueToBps", () => {
	it("parses common bitrate string forms", () => {
		expect(parseBitrateValueToBps("8M")).to.equal(8_000_000);
		expect(parseBitrateValueToBps("8m")).to.equal(8_000_000);
		expect(parseBitrateValueToBps("500k")).to.equal(500_000);
		expect(parseBitrateValueToBps("4.5M")).to.equal(4_500_000);
		expect(parseBitrateValueToBps("8000000")).to.equal(8_000_000);
	});

	it("passes positive numbers through verbatim", () => {
		expect(parseBitrateValueToBps(8_000_000)).to.equal(8_000_000);
	});

	it("returns null for non-positive / unparseable inputs", () => {
		expect(parseBitrateValueToBps(null)).to.equal(null);
		expect(parseBitrateValueToBps(undefined)).to.equal(null);
		expect(parseBitrateValueToBps("")).to.equal(null);
		expect(parseBitrateValueToBps("abc")).to.equal(null);
		expect(parseBitrateValueToBps(0)).to.equal(null);
		expect(parseBitrateValueToBps(-1)).to.equal(null);
	});
});

describe("buildRecommendation currentSettings threading", () => {
	it("uses currentSettings.videoBitrate to gate the inconclusive zone", () => {
		// Same viewer state as a previous-floor reading, but
		// currentSettings tells the recommender we are already at 4M
		// and the measurement is pinned near 4 Mbit/s. The
		// recommendation must NOT drop further — that's the spiral
		// guard.
		const viewers = [buildViewer({ network: { hlsBandwidthEstimateMbit: 4 } }), buildViewer({ network: { hlsBandwidthEstimateMbit: 4 } })];
		const summary = aggregateViewers(viewers, "session-spiral");
		const result = buildRecommendation({
			sessionId: "session-spiral",
			summary,
			viewerSnapshots: viewers,
			ceiling: buildCeiling({ videoBitrate: 8_000_000 }),
			currentSettings: { videoBitrate: "4M" },
		});
		expect(result.videoBitrate).to.equal(4_000_000);
		expect(result.reason).to.match(/held current bitrate/);
	});

	it("ignores currentSettings when the load-fraction signal indicates real headroom", () => {
		// Same viewer state as above, but load fraction is well below
		// 0.4 — the link genuinely has spare capacity. We're allowed
		// to climb back to ceiling.
		const viewers = [
			buildViewer({ network: { hlsBandwidthEstimateMbit: 4, loadFractionAvg: 0.1 } }),
			buildViewer({ network: { hlsBandwidthEstimateMbit: 4, loadFractionAvg: 0.2 } }),
		];
		const summary = aggregateViewers(viewers, "session-recover");
		const result = buildRecommendation({
			sessionId: "session-recover",
			summary,
			viewerSnapshots: viewers,
			ceiling: buildCeiling({ videoBitrate: 8_000_000 }),
			currentSettings: { videoBitrate: "4M" },
		});
		expect(result.videoBitrate).to.equal(8_000_000);
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
