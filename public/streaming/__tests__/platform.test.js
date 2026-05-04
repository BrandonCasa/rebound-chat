/**
 * Tests the platform-profile boundary layer:
 *   - the right profile is selected per host
 *   - encoder family / preset helpers stay in sync with each profile's codec list
 *   - normalization rejects codecs/captures outside the active profile
 *
 * Run with `node --test public/streaming/__tests__/platform.test.js`.
 */

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { codecFamily } from "../codecs.js";
import { ENCODER_PRESETS, normalizeEncoderPreset } from "../presets.js";
import { availableEncoderFamilies, availableEncoderPresets, defaultEncoderPresets, selectPlatformProfile } from "../platform/index.js";
import { DARWIN, FALLBACK_PROFILE, LINUX_ARM64, LINUX_X64, PLATFORM_PROFILES, WIN32_ARM64, WIN32_X64 } from "../platform/profiles.js";
import { buildDefaultSettings } from "../defaults.js";

describe("platform.selectPlatformProfile", () => {
	it("returns the darwin profile for darwin/arm64", () => {
		const profile = selectPlatformProfile({ platform: "darwin", arch: "arm64" });
		assert.equal(profile.id, DARWIN.id);
	});

	it("returns the darwin profile for darwin/x64", () => {
		const profile = selectPlatformProfile({ platform: "darwin", arch: "x64" });
		assert.equal(profile.id, DARWIN.id);
	});

	it("returns the win32-x64 profile for win32/x64", () => {
		const profile = selectPlatformProfile({ platform: "win32", arch: "x64" });
		assert.equal(profile.id, WIN32_X64.id);
	});

	it("returns the win32-arm64 profile for win32/arm64", () => {
		const profile = selectPlatformProfile({ platform: "win32", arch: "arm64" });
		assert.equal(profile.id, WIN32_ARM64.id);
	});

	it("returns the linux-x64 profile for linux/x64", () => {
		const profile = selectPlatformProfile({ platform: "linux", arch: "x64" });
		assert.equal(profile.id, LINUX_X64.id);
	});

	it("returns the linux-arm64 profile for linux/arm64", () => {
		const profile = selectPlatformProfile({ platform: "linux", arch: "arm64" });
		assert.equal(profile.id, LINUX_ARM64.id);
	});

	it("returns the permissive fallback for an unknown platform", () => {
		const profile = selectPlatformProfile({ platform: "freebsd", arch: "x64" });
		assert.equal(profile.id, FALLBACK_PROFILE.id);
	});
});

describe("platform — declared codecs are internally consistent", () => {
	it("every codec in every profile resolves to a known family", () => {
		for (const profile of PLATFORM_PROFILES) {
			for (const codec of profile.videoCodecs) {
				assert.doesNotThrow(() => codecFamily(codec), `${profile.id} declares unknown codec ${codec}`);
			}
		}
	});

	it("each profile's default codec is in its own videoCodecs list", () => {
		for (const profile of PLATFORM_PROFILES) {
			assert.ok(profile.videoCodecs.includes(profile.defaults.videoCodec), `${profile.id} default "${profile.defaults.videoCodec}" not in videoCodecs`);
			assert.ok(profile.audioCodecs.includes(profile.defaults.audioCodec), `${profile.id} default audio "${profile.defaults.audioCodec}" not in audioCodecs`);
			assert.ok(
				profile.captureBackends.includes(profile.defaults.captureBackend),
				`${profile.id} default capture "${profile.defaults.captureBackend}" not in captureBackends`
			);
		}
	});

	it("each profile's default encoderPreset is valid for its default codec", () => {
		for (const profile of PLATFORM_PROFILES) {
			const family = codecFamily(profile.defaults.videoCodec);
			const allowed = ENCODER_PRESETS[family];
			assert.ok(
				allowed?.includes(profile.defaults.encoderPreset),
				`${profile.id} default preset "${profile.defaults.encoderPreset}" not valid for family "${family}"`
			);
			assert.doesNotThrow(() => normalizeEncoderPreset(profile.defaults.videoCodec, profile.defaults.encoderPreset));
		}
	});
});

describe("platform.availableEncoderFamilies / availableEncoderPresets", () => {
	it("darwin exposes only videotoolbox (no HW GPU, no software codecs from third-party libs)", () => {
		const families = availableEncoderFamilies(DARWIN);
		assert.deepEqual(families.sort(), ["videotoolbox"]);
		const presets = availableEncoderPresets(DARWIN);
		assert.deepEqual(Object.keys(presets).sort(), ["videotoolbox"]);
		assert.deepEqual(presets.videotoolbox, ["realtime"]);
	});

	it("win32-x64 exposes nvenc, amf, qsv, and key software families; no x264/x265 (GPL)", () => {
		const families = availableEncoderFamilies(WIN32_X64).sort();
		assert.ok(families.includes("nvenc"), "expected nvenc");
		assert.ok(families.includes("amf"), "expected amf");
		assert.ok(families.includes("qsv"), "expected qsv");
		assert.ok(families.includes("svt_av1"), "expected svt_av1");
		assert.ok(families.includes("libaom_av1"), "expected libaom_av1");
		assert.ok(families.includes("libvpx_vp9"), "expected libvpx_vp9");
		assert.ok(families.includes("rav1e"), "expected rav1e");
		assert.ok(families.includes("vvenc"), "expected vvenc");
		assert.ok(families.includes("openh264"), "expected openh264");
		assert.ok(!families.includes("software"), "did not expect software (GPL x264/x265)");
		assert.ok(!families.includes("vaapi"), "did not expect vaapi on windows");
	});

	it("win32-arm64 has no nvenc, no qsv, no libaom, no libvpx", () => {
		const families = availableEncoderFamilies(WIN32_ARM64);
		assert.ok(!families.includes("nvenc"), "did not expect nvenc on winarm64");
		assert.ok(!families.includes("qsv"), "did not expect qsv on winarm64");
		assert.ok(!families.includes("libaom_av1"), "did not expect libaom on winarm64");
		assert.ok(!families.includes("libvpx_vp9"), "did not expect libvpx on winarm64");
		assert.ok(families.includes("amf"), "expected amf on winarm64");
		assert.ok(families.includes("svt_av1"), "expected svt_av1 on winarm64");
	});

	it("linux-x64 includes vaapi (not on any other platform)", () => {
		const linuxFamilies = availableEncoderFamilies(LINUX_X64);
		assert.ok(linuxFamilies.includes("vaapi"), "expected vaapi on linux-x64");

		for (const profile of [DARWIN, WIN32_X64, WIN32_ARM64, LINUX_ARM64]) {
			const families = availableEncoderFamilies(profile);
			assert.ok(!families.includes("vaapi"), `did not expect vaapi on ${profile.id}`);
		}
	});

	it("linux-arm64 has no qsv, no vaapi", () => {
		const families = availableEncoderFamilies(LINUX_ARM64);
		assert.ok(!families.includes("qsv"), "did not expect qsv on linuxarm64");
		assert.ok(!families.includes("vaapi"), "did not expect vaapi on linuxarm64");
	});

	it("defaultEncoderPresets is always a subset of availableEncoderPresets", () => {
		for (const profile of PLATFORM_PROFILES) {
			const defaults = defaultEncoderPresets(profile);
			const available = availableEncoderPresets(profile);
			for (const [family, defaultPreset] of Object.entries(defaults)) {
				assert.ok(available[family]?.includes(defaultPreset), `${profile.id} default preset "${defaultPreset}" not in available["${family}"]`);
			}
		}
	});
});

describe("defaults.buildDefaultSettings({ profile })", () => {
	it("darwin: videotoolbox codec, avfoundation capture, realtime preset", () => {
		const s = buildDefaultSettings({ profile: DARWIN });
		assert.equal(s.videoCodec, "h264_videotoolbox");
		assert.equal(s.audioCodec, "aac");
		assert.equal(s.captureBackend, "avfoundation");
		assert.equal(s.encoderPreset, "realtime");
	});

	it("win32-x64: nvenc codec, gfxcapture, p6 preset", () => {
		const s = buildDefaultSettings({ profile: WIN32_X64 });
		assert.equal(s.videoCodec, "h264_nvenc");
		assert.equal(s.captureBackend, "gfxcapture");
		assert.equal(s.encoderPreset, "p6");
	});

	it("win32-arm64: svtav1 codec, preset 8", () => {
		const s = buildDefaultSettings({ profile: WIN32_ARM64 });
		assert.equal(s.videoCodec, "libsvtav1");
		assert.equal(s.encoderPreset, "8");
	});

	it("linux-x64: svtav1 codec, x11grab capture, preset 8", () => {
		const s = buildDefaultSettings({ profile: LINUX_X64 });
		assert.equal(s.videoCodec, "libsvtav1");
		assert.equal(s.captureBackend, "x11grab");
		assert.equal(s.encoderPreset, "8");
	});

	it("linux-arm64: svtav1 codec, x11grab capture, preset 8", () => {
		const s = buildDefaultSettings({ profile: LINUX_ARM64 });
		assert.equal(s.videoCodec, "libsvtav1");
		assert.equal(s.captureBackend, "x11grab");
		assert.equal(s.encoderPreset, "8");
	});
});
