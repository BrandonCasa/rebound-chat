/**
 * Unit tests for the shared VBV bufsize helper.
 *
 * The math is intentionally trivial — these tests exist so a future
 * rounding-bug or unit-mix-up regression is caught immediately, and so
 * the relationship between configured bitrate, multiplier, and the
 * value FFmpeg sees on its argv is documented in code rather than only
 * in the plan write-up.
 *
 * Run with `node --test public/streaming/__tests__/vbv.test.js`.
 */

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { computeVbvBufsize } from "../encoder/_vbv.js";
import { buildArgs as buildNvencArgs } from "../encoder/nvenc.js";
import { buildArgs as buildQsvArgs } from "../encoder/qsv.js";
import { buildArgs as buildSoftwareArgs } from "../encoder/software.js";
import { buildArgs as buildAmfArgs } from "../encoder/amf.js";
import { buildArgs as buildVideotoolboxArgs } from "../encoder/videotoolbox.js";
import { buildArgs as buildVaapiArgs } from "../encoder/vaapi.js";
import { windowsRtxNvenc1080p60, windowsQsv, windowsGfxcaptureSoftware, linuxVaapi, withDefaults } from "./fixtures/configs.js";

describe("computeVbvBufsize — pure math", () => {
	it("8M at multiplier 1.0 → 8_000_000 (1-second window, the live default)", () => {
		assert.equal(computeVbvBufsize("8M", 1.0), 8_000_000);
	});

	it("8M at multiplier 0.5 → 4_000_000 (the stable-uplink window)", () => {
		assert.equal(computeVbvBufsize("8M", 0.5), 4_000_000);
	});

	it("8M at multiplier 2.0 → 16_000_000 (the legacy VOD window)", () => {
		assert.equal(computeVbvBufsize("8M", 2.0), 16_000_000);
	});

	it("defaults to multiplier 1.0 when omitted", () => {
		assert.equal(computeVbvBufsize("8M"), 8_000_000);
	});

	it("accepts kilobit suffix", () => {
		assert.equal(computeVbvBufsize("2500k", 1.0), 2_500_000);
	});

	it("rounds to an integer (FFmpeg won't accept a fractional bufsize)", () => {
		// 6M at 0.5 = 3_000_000 (integer); 6M at 0.333 ≈ 1_998_000 (rounded).
		assert.equal(computeVbvBufsize("6M", 0.5), 3_000_000);
		assert.equal(computeVbvBufsize("6M", 0.333), 1_998_000);
	});
});

describe("vbvMultiplier flows through every encoder argv", () => {
	const pickBufsize = (args) => args[args.indexOf("-bufsize") + 1];

	it("nvenc honours vbvMultiplier 0.5 (CBR/stable-uplink) and 2.0 (legacy)", () => {
		const baseline = windowsRtxNvenc1080p60();
		assert.equal(pickBufsize(buildNvencArgs(baseline)), "8000000");
		assert.equal(pickBufsize(buildNvencArgs({ ...baseline, vbvMultiplier: 0.5 })), "4000000");
		assert.equal(pickBufsize(buildNvencArgs({ ...baseline, vbvMultiplier: 2.0 })), "16000000");
	});

	it("qsv honours vbvMultiplier", () => {
		const baseline = windowsQsv();
		assert.equal(pickBufsize(buildQsvArgs(baseline)), "8000000");
		assert.equal(pickBufsize(buildQsvArgs({ ...baseline, vbvMultiplier: 0.5 })), "4000000");
	});

	it("software (libx264) honours vbvMultiplier", () => {
		const baseline = windowsGfxcaptureSoftware();
		assert.equal(pickBufsize(buildSoftwareArgs(baseline)), "8000000");
		assert.equal(pickBufsize(buildSoftwareArgs({ ...baseline, vbvMultiplier: 0.5 })), "4000000");
	});

	it("amf honours vbvMultiplier", () => {
		const baseline = withDefaults({ videoCodec: "h264_amf", encoderPreset: "balanced" });
		assert.equal(pickBufsize(buildAmfArgs(baseline)), "8000000");
		assert.equal(pickBufsize(buildAmfArgs({ ...baseline, vbvMultiplier: 0.5 })), "4000000");
	});

	it("videotoolbox honours vbvMultiplier", () => {
		const baseline = withDefaults({ videoCodec: "h264_videotoolbox", encoderPreset: "realtime" });
		assert.equal(pickBufsize(buildVideotoolboxArgs(baseline)), "8000000");
		assert.equal(pickBufsize(buildVideotoolboxArgs({ ...baseline, vbvMultiplier: 0.5 })), "4000000");
	});

	it("vaapi honours vbvMultiplier", () => {
		const baseline = linuxVaapi();
		assert.equal(pickBufsize(buildVaapiArgs(baseline)), "8000000");
		assert.equal(pickBufsize(buildVaapiArgs({ ...baseline, vbvMultiplier: 0.5 })), "4000000");
	});

	it("falls back to multiplier 1.0 when vbvMultiplier is missing from the config (legacy callers)", () => {
		const baseline = windowsRtxNvenc1080p60();
		// eslint-disable-next-line no-unused-vars
		const { vbvMultiplier: _omit, ...withoutMultiplier } = baseline;
		assert.equal(pickBufsize(buildNvencArgs(withoutMultiplier)), "8000000");
	});
});
