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

describe("applyRecommendation ceiling-bounded clamp", () => {
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

	it("raises numeric fields toward the recommendation when above current and within the ceiling", () => {
		// Streamer was previously demoted by a poor viewer; now the
		// server says we can move back up partway. The adapter must let
		// us climb, not pin us at the demoted state forever.
		const current = buildConfig({ videoBitrate: "3M", outputWidth: 1280, outputHeight: 720, fps: 30 });
		const ceiling = buildInitialCeiling(buildConfig());
		const recommendation = buildRecommendation({
			videoBitrate: 6_000_000,
			outputWidth: 1600,
			outputHeight: 900,
			fps: 60,
		});

		const { next, diff, clampedBy, wouldRespawn } = applyRecommendation(current, recommendation, ceiling);
		assert.equal(wouldRespawn, true);
		assert.equal(next.videoBitrate, "6M");
		assert.equal(next.outputWidth, 1600);
		assert.equal(next.outputHeight, 900);
		assert.equal(next.fps, 60);
		assert.equal(clampedBy, null, "recommendation was within the ceiling so nothing was clamped down");
		const fields = diff.map((entry) => entry.field).sort();
		assert.deepEqual(fields, ["fps", "outputHeight", "outputWidth", "videoBitrate"]);
	});

	it("clamps an above-ceiling recommendation to the ceiling on the way up", () => {
		const current = buildConfig({ videoBitrate: "3M", outputWidth: 1280, outputHeight: 720, fps: 30 });
		const ceiling = buildInitialCeiling(buildConfig());
		const recommendation = buildRecommendation({
			videoBitrate: 25_000_000,
			outputWidth: 3840,
			outputHeight: 2160,
			fps: 120,
		});

		const { next, clampedBy } = applyRecommendation(current, recommendation, ceiling);
		assert.equal(next.videoBitrate, "8M");
		assert.equal(next.outputWidth, 1920);
		assert.equal(next.outputHeight, 1080);
		assert.equal(next.fps, 60);
		assert.equal(clampedBy, "user-initial-ceiling");
	});

	it("promotes back to the exact ceiling codec across hardware families", () => {
		// The recommender previously pushed us off NVENC AV1 onto a
		// software fallback because the only viewer couldn't decode AV1.
		// That viewer leaves, so the recommender now restores the
		// ceiling codec. The adapter must accept it because the user
		// already proved their box can encode it (it was the ceiling).
		const current = buildConfig({ videoCodec: "libopenh264" });
		const ceiling = buildInitialCeiling(buildConfig({ videoCodec: "av1_nvenc" }));
		const recommendation = buildRecommendation({ videoCodec: "av1_nvenc" });

		const { next, diff } = applyRecommendation(current, recommendation, ceiling);
		assert.equal(next.videoCodec, "av1_nvenc");
		const codecChange = diff.find((entry) => entry.field === "videoCodec");
		assert.ok(codecChange);
		assert.equal(codecChange.from, "libopenh264");
		assert.equal(codecChange.to, "av1_nvenc");
	});

	it("rejects a cross-family codec swap that is not the ceiling codec", () => {
		// Same ceiling as the current codec — a recommendation suggesting
		// a *different* family from both is unsafe (we have no proof the
		// streamer's box can encode it) and must be ignored.
		const current = buildConfig({ videoCodec: "h264_nvenc" });
		const ceiling = buildInitialCeiling(current);
		const recommendation = buildRecommendation({ videoCodec: "libsvtav1" });

		const { next, diff } = applyRecommendation(current, recommendation, ceiling);
		assert.equal(next.videoCodec, "h264_nvenc");
		assert.equal(
			diff.find((entry) => entry.field === "videoCodec"),
			undefined
		);
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

	it("returns wouldRespawn=false when the recommendation only differs sub-display from the current bitrate", () => {
		// Regression: the recommender emits integer bps values derived
		// from a fractional downlink (e.g. round(downlinkBps * 0.7 * 0.8)).
		// When that value collapses to the same `toBitrateString` output
		// as the current bitrate, respawning would re-encode at the
		// identical display precision and produce no observable change.
		// Worse, the respawn triggers an `updateCeiling` hello back to the
		// server which force-pushes the same recommendation again,
		// causing an infinite respawn loop. The adapter must treat such
		// recommendations as no-ops.
		const current = buildConfig({ videoBitrate: "6.64M" });
		const ceiling = buildInitialCeiling(current);
		const recommendation = buildRecommendation({
			videoBitrate: 6_638_400,
			outputWidth: 1920,
			outputHeight: 1080,
		});

		const { next, diff, wouldRespawn, clampedBy } = applyRecommendation(current, recommendation, ceiling);
		assert.equal(wouldRespawn, false, "no respawn when target rounds to the current display string");
		assert.equal(diff.length, 0);
		assert.equal(next.videoBitrate, "6.64M");
		assert.equal(clampedBy, null);
	});

	it("returns wouldRespawn=false when the bitrate string differs but the parsed bps matches", () => {
		// "8000k" and "8M" represent the same encoder bitrate. Treating
		// the canonical-bps comparison as the source of truth keeps the
		// adapter idempotent even when the user's bitrate string isn't
		// the canonical form `toBitrateString` would emit.
		const current = buildConfig({ videoBitrate: "8000k" });
		const ceiling = buildInitialCeiling(current);
		const recommendation = buildRecommendation({
			videoBitrate: 8_000_000,
			outputWidth: 1920,
			outputHeight: 1080,
		});

		const { wouldRespawn, diff } = applyRecommendation(current, recommendation, ceiling);
		assert.equal(wouldRespawn, false);
		assert.equal(diff.length, 0);
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

	it("pins resolution but still adapts bitrate/fps/codec when allowResolutionAdaptation=false", () => {
		const current = buildConfig();
		const ceiling = buildInitialCeiling(current);
		const recommendation = buildRecommendation({
			videoBitrate: 3_000_000,
			outputWidth: 1280,
			outputHeight: 720,
			fps: 30,
		});

		const { next, diff, wouldRespawn } = applyRecommendation(current, recommendation, ceiling, { allowResolutionAdaptation: false });
		assert.equal(wouldRespawn, true, "bitrate/fps still flex even with resolution pinned");
		assert.equal(next.outputWidth, 1920, "outputWidth must stay at the current value");
		assert.equal(next.outputHeight, 1080, "outputHeight must stay at the current value");
		assert.equal(next.videoBitrate, "3M");
		assert.equal(next.fps, 30);
		const fields = diff.map((entry) => entry.field).sort();
		assert.deepEqual(fields, ["fps", "videoBitrate"]);
	});

	it("does not change resolution at all when allowResolutionAdaptation=false even on the way up", () => {
		// Streamer is already below its ceiling resolution. With resolution
		// adaptation disabled, the adapter must NOT raise the resolution
		// back toward the ceiling either — pinning is symmetric.
		const current = buildConfig({ outputWidth: 1280, outputHeight: 720 });
		const ceiling = buildInitialCeiling(buildConfig());
		const recommendation = buildRecommendation({
			outputWidth: 1920,
			outputHeight: 1080,
		});

		const { next, diff } = applyRecommendation(current, recommendation, ceiling, { allowResolutionAdaptation: false });
		assert.equal(next.outputWidth, 1280);
		assert.equal(next.outputHeight, 720);
		assert.equal(
			diff.find((entry) => entry.field === "outputWidth"),
			undefined
		);
		assert.equal(
			diff.find((entry) => entry.field === "outputHeight"),
			undefined
		);
	});

	it("treats omitted options as allowResolutionAdaptation=true (backward compatible)", () => {
		const current = buildConfig();
		const ceiling = buildInitialCeiling(current);
		const recommendation = buildRecommendation({
			outputWidth: 1280,
			outputHeight: 720,
		});

		const { next } = applyRecommendation(current, recommendation, ceiling);
		assert.equal(next.outputWidth, 1280, "omitted options must default to legacy behaviour");
		assert.equal(next.outputHeight, 720);
	});
});
