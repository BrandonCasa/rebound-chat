import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { applyRecommendation, summarizeDiff } from "../../server-control/adapter.js";
import { buildInitialCeiling } from "../../server-control/initialCeiling.js";

const buildConfig = (overrides = {}) => ({
	videoBitrate: "8M",
	videoCodec: "h264_nvenc",
	outputWidth: 1920,
	outputHeight: 1080,
	fps: 60,
	encoderPreset: "p4",
	...overrides,
});

const buildRecommendation = (overrides = {}) => ({
	sessionId: "session-1",
	videoBitrate: 4_000_000,
	videoCodec: "h264_nvenc",
	outputWidth: 1280,
	outputHeight: 720,
	fps: 60,
	reason: "viewer downlink",
	derivedFromViewerCount: 1,
	updatedAt: 1700000000000,
	...overrides,
});

describe("applyRecommendation lower-only clamp", () => {
	it("never raises any numeric field above the ceiling", () => {
		const current = buildConfig();
		const ceiling = buildInitialCeiling(current);
		const recommendation = buildRecommendation({
			videoBitrate: 12_000_000,
			outputWidth: 3840,
			outputHeight: 2160,
			fps: 120,
		});

		const { next, diff, clampedBy, wouldRespawn } = applyRecommendation(current, recommendation, ceiling);
		assert.equal(diff.length, 0, "no field should change when recommendation > ceiling and current is at ceiling");
		assert.equal(wouldRespawn, false);
		assert.equal(clampedBy, null);
		assert.equal(next.videoBitrate, current.videoBitrate);
		assert.equal(next.outputHeight, 1080);
	});

	it("lowers numeric fields toward the recommendation when below current", () => {
		const current = buildConfig();
		const ceiling = buildInitialCeiling(current);
		const recommendation = buildRecommendation({
			videoBitrate: 3_000_000,
			outputWidth: 1280,
			outputHeight: 720,
		});

		const { next, diff, wouldRespawn } = applyRecommendation(current, recommendation, ceiling);
		assert.equal(wouldRespawn, true);
		assert.equal(next.videoBitrate, "3M");
		assert.equal(next.outputWidth, 1280);
		assert.equal(next.outputHeight, 720);
		const fields = diff.map((entry) => entry.field).sort();
		assert.deepEqual(fields, ["outputHeight", "outputWidth", "videoBitrate"]);
	});

	it("flags clampedBy=user-initial-ceiling when recommendation exceeds ceiling and current was above ceiling", () => {
		// This degenerate case can arise when the user shrinks the ceiling
		// mid-stream (a future feature) or when migrating an existing
		// session's settings. We want the clamp result to surface "we held
		// you to your ceiling, even though the server suggested higher."
		const current = buildConfig({ videoBitrate: "8M" });
		const ceiling = buildInitialCeiling(buildConfig({ videoBitrate: "5M" }));
		const recommendation = buildRecommendation({ videoBitrate: 7_000_000 });

		const { clampedBy, next, diff } = applyRecommendation(current, recommendation, ceiling);
		assert.equal(next.videoBitrate, "5M", "ceiling wins over recommendation");
		assert.equal(clampedBy, "user-initial-ceiling");
		assert.ok(diff.find((entry) => entry.field === "videoBitrate"));
	});

	it("demotes within the same encoder family but does not switch encoder family", () => {
		const current = buildConfig({ videoCodec: "h264_nvenc" });
		const ceiling = buildInitialCeiling(current);
		const recommendation = buildRecommendation({ videoCodec: "h264_qsv" });

		const { next, diff } = applyRecommendation(current, recommendation, ceiling);
		assert.equal(next.videoCodec, "h264_nvenc");
		assert.equal(
			diff.find((entry) => entry.field === "videoCodec"),
			undefined
		);
	});

	it("accepts a codec swap within the same hardware family", () => {
		const current = buildConfig({ videoCodec: "hevc_nvenc" });
		const ceiling = buildInitialCeiling(current);
		const recommendation = buildRecommendation({ videoCodec: "h264_nvenc" });

		const { next, diff } = applyRecommendation(current, recommendation, ceiling);
		assert.equal(next.videoCodec, "h264_nvenc");
		const codecChange = diff.find((entry) => entry.field === "videoCodec");
		assert.ok(codecChange);
		assert.equal(codecChange.from, "hevc_nvenc");
		assert.equal(codecChange.to, "h264_nvenc");
	});

	it("returns wouldRespawn=false when nothing meaningful changed", () => {
		const current = buildConfig();
		const ceiling = buildInitialCeiling(current);
		const recommendation = buildRecommendation({
			videoBitrate: 8_000_000,
			outputWidth: 1920,
			outputHeight: 1080,
			fps: 60,
			videoCodec: "h264_nvenc",
		});

		const { wouldRespawn } = applyRecommendation(current, recommendation, ceiling);
		assert.equal(wouldRespawn, false);
	});

	it("summarizeDiff reads as a human sentence", () => {
		const summary = summarizeDiff([
			{ field: "videoBitrate", from: "8M", to: "3M" },
			{ field: "outputHeight", from: 1080, to: 720 },
		]);
		assert.equal(summary, "videoBitrate: 8M → 3M; outputHeight: 1080 → 720");
	});

	it("returns empty diff when the streamer has no active config", () => {
		const result = applyRecommendation(null, buildRecommendation(), buildInitialCeiling(buildConfig()));
		assert.equal(result.diff.length, 0);
		assert.equal(result.wouldRespawn, false);
	});
});
