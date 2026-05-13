/**
 * Tests for the curated streaming quality profiles
 * (`public/streaming/profiles/`).
 *
 * Profiles describe encoder trade-offs (latency vs. quality) and
 * compose with the active `StreamConfig`. These tests exercise three
 * properties:
 *
 *   1. Each profile's values are valid inputs to `nvenc.buildArgs` —
 *      a profile cannot define a combo that throws.
 *   2. `applyProfile` round-trips: applying a profile to a baseline
 *      config produces an argv that visibly reflects the profile's
 *      intent (e.g. Low Latency removes lookahead; Quality includes
 *      multipass fullres).
 *   3. The Low Latency profile is structurally free of every flag
 *      that would add encoder-side latency.
 *
 * Run with `node --test public/streaming/__tests__/profiles/profiles.test.js`.
 */

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { applyProfile, balanced, DEFAULT_PROFILE_ID, getProfile, lowLatency, quality, stableUplink, STREAMING_PROFILES } from "../../profiles/index.js";
import { buildArgs as buildNvencArgs } from "../../encoder/nvenc.js";
import { windowsRtxNvenc1080p60 } from "../fixtures/configs.js";

describe("profiles registry", () => {
	it("exports four profiles with the expected ids", () => {
		const ids = STREAMING_PROFILES.map((profile) => profile.id).sort();
		assert.deepEqual(ids, ["balanced", "low-latency", "quality", "stable-uplink"]);
	});

	it("default profile id resolves to a registered profile", () => {
		assert.ok(getProfile(DEFAULT_PROFILE_ID), "DEFAULT_PROFILE_ID must point at a registered profile");
		assert.equal(DEFAULT_PROFILE_ID, "low-latency", "low-latency is the live-streaming gaming default");
	});

	it("each profile has the required shape (id, label, description, latencyHint, values)", () => {
		for (const profile of STREAMING_PROFILES) {
			assert.equal(typeof profile.id, "string", `${profile.id}: id must be a string`);
			assert.equal(typeof profile.label, "string", `${profile.id}: label must be a string`);
			assert.equal(typeof profile.description, "string", `${profile.id}: description must be a string`);
			assert.equal(typeof profile.latencyHint, "string", `${profile.id}: latencyHint must be a string`);
			assert.equal(typeof profile.values, "object", `${profile.id}: values must be an object`);
			assert.notEqual(profile.values, null, `${profile.id}: values must not be null`);
		}
	});

	it("getProfile returns undefined for unknown ids (renderer reads this as 'custom')", () => {
		assert.equal(getProfile("does-not-exist"), undefined);
		assert.equal(getProfile(""), undefined);
	});
});

describe("profiles → nvenc.buildArgs round-trip", () => {
	const baseline = windowsRtxNvenc1080p60();

	it("every profile produces a valid argv when applied to the baseline NVENC config", () => {
		for (const profile of STREAMING_PROFILES) {
			const config = applyProfile(profile, baseline);
			assert.doesNotThrow(() => buildNvencArgs(config), `${profile.id}: buildArgs must not throw`);
			const args = buildNvencArgs(config);
			assert.ok(args.includes("-c:v"), `${profile.id}: argv missing -c:v`);
			assert.ok(args.includes("-tune"), `${profile.id}: argv missing -tune`);
			assert.ok(args.includes("-preset"), `${profile.id}: argv missing -preset`);
		}
	});

	it("low-latency: no -rc-lookahead, -bf 0, no -multipass, -b_ref_mode disabled (the four flags that hold frames)", () => {
		const args = buildNvencArgs(applyProfile(lowLatency, baseline));
		assert.ok(!args.includes("-rc-lookahead"), "low-latency must not emit -rc-lookahead");
		assert.ok(!args.includes("-multipass"), "low-latency must not emit -multipass (suppressed when 'disabled')");
		assert.equal(args[args.indexOf("-bf") + 1], "0", "low-latency must emit -bf 0");
		assert.equal(args[args.indexOf("-b_ref_mode") + 1], "disabled", "low-latency must emit -b_ref_mode disabled");
		assert.equal(args[args.indexOf("-temporal_aq") + 1], "0", "low-latency must emit -temporal_aq 0 (no lookahead → no benefit)");
		assert.equal(args[args.indexOf("-preset") + 1], "p4", "low-latency uses the 'll' alias preset (p4)");
	});

	it("balanced: reintroduces lookahead, qres multipass, 2 B-frames, temporal-AQ on, p5 preset", () => {
		const args = buildNvencArgs(applyProfile(balanced, baseline));
		assert.equal(args[args.indexOf("-rc-lookahead") + 1], "8", "balanced uses -rc-lookahead 8");
		assert.equal(args[args.indexOf("-multipass") + 1], "qres", "balanced uses -multipass qres (quarter-res first pass)");
		assert.equal(args[args.indexOf("-bf") + 1], "2", "balanced uses 2 B-frames");
		assert.equal(args[args.indexOf("-b_ref_mode") + 1], "middle", "balanced enables pyramid B-ref");
		assert.equal(args[args.indexOf("-temporal_aq") + 1], "1", "balanced enables temporal-AQ (lookahead > 0)");
		assert.equal(args[args.indexOf("-preset") + 1], "p5", "balanced uses 'medium' preset (p5)");
	});

	it("quality: matches the pre-Plan-01 defaults — fullres multipass, 3 B-frames, lookahead 16, p6 preset", () => {
		const args = buildNvencArgs(applyProfile(quality, baseline));
		assert.equal(args[args.indexOf("-multipass") + 1], "fullres", "quality uses -multipass fullres (full first-pass encode)");
		assert.equal(args[args.indexOf("-bf") + 1], "3", "quality uses 3 B-frames");
		assert.equal(args[args.indexOf("-b_ref_mode") + 1], "middle", "quality enables pyramid B-ref");
		assert.equal(args[args.indexOf("-rc-lookahead") + 1], "16", "quality uses -rc-lookahead 16");
		assert.equal(args[args.indexOf("-temporal_aq") + 1], "1", "quality enables temporal-AQ");
		assert.equal(args[args.indexOf("-preset") + 1], "p6", "quality uses 'slow' preset (p6)");
	});

	it("stable-uplink: CBR rate control with a 0.5×-bitrate VBV window for capped uplinks", () => {
		const args = buildNvencArgs(applyProfile(stableUplink, baseline));
		// CBR (vs. low-latency's vbr) is the entire point — peak bitrate must
		// converge to the configured ceiling on contended uplinks.
		assert.equal(args[args.indexOf("-rc") + 1], "cbr", "stable-uplink uses -rc cbr");
		// Tight VBV: 8M × 0.5 = 4_000_000 bits (half-second window).
		assert.equal(args[args.indexOf("-bufsize") + 1], "4000000", "stable-uplink uses a 0.5×-bitrate VBV buffer");
		// Same latency profile as Low Latency: every frame-holding flag stays off.
		assert.ok(!args.includes("-rc-lookahead"), "stable-uplink must not emit -rc-lookahead");
		assert.ok(!args.includes("-multipass"), "stable-uplink must not emit -multipass");
		assert.equal(args[args.indexOf("-bf") + 1], "0", "stable-uplink keeps -bf 0");
		assert.equal(args[args.indexOf("-b_ref_mode") + 1], "disabled", "stable-uplink keeps -b_ref_mode disabled");
		assert.equal(args[args.indexOf("-temporal_aq") + 1], "0", "stable-uplink keeps -temporal_aq 0");
		assert.equal(args[args.indexOf("-preset") + 1], "p4", "stable-uplink uses the 'll' alias preset (p4)");
	});
});

describe("applyProfile semantics", () => {
	it("does not mutate the input settings object", () => {
		const settings = windowsRtxNvenc1080p60();
		const snapshot = JSON.stringify(settings);
		applyProfile(quality, settings);
		assert.equal(JSON.stringify(settings), snapshot, "applyProfile must return a new object, not mutate in place");
	});

	it("preserves fields the profile does not touch (resolution, bitrate, audio)", () => {
		const settings = windowsRtxNvenc1080p60();
		const merged = applyProfile(lowLatency, settings);
		assert.equal(merged.outputWidth, settings.outputWidth);
		assert.equal(merged.outputHeight, settings.outputHeight);
		assert.equal(merged.videoBitrate, settings.videoBitrate);
		assert.equal(merged.audioCodec, settings.audioCodec);
		assert.equal(merged.captureBackend, settings.captureBackend);
		assert.equal(merged.fps, settings.fps);
	});

	it("applying then re-applying the same profile is idempotent", () => {
		const settings = windowsRtxNvenc1080p60();
		const once = applyProfile(balanced, settings);
		const twice = applyProfile(balanced, once);
		assert.deepEqual(once, twice);
	});
});
