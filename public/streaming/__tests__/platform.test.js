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
import { DARWIN_LGPL_SHARED, FALLBACK_PROFILE, LINUX_BTBN_LGPL_SHARED, PLATFORM_PROFILES, WIN32_BTBN_LGPL_SHARED } from "../platform/profiles.js";
import { buildDefaultSettings } from "../defaults.js";

describe("platform.selectPlatformProfile", () => {
	it("returns the darwin profile for darwin hosts", () => {
		const profile = selectPlatformProfile({ platform: "darwin", arch: "arm64" });
		assert.equal(profile.id, DARWIN_LGPL_SHARED.id);
	});

	it("returns the win32 profile for win32 hosts", () => {
		const profile = selectPlatformProfile({ platform: "win32", arch: "x64" });
		assert.equal(profile.id, WIN32_BTBN_LGPL_SHARED.id);
	});

	it("returns the linux profile for linux hosts", () => {
		const profile = selectPlatformProfile({ platform: "linux", arch: "x64" });
		assert.equal(profile.id, LINUX_BTBN_LGPL_SHARED.id);
	});

	it("returns the permissive fallback for an unknown platform", () => {
		const profile = selectPlatformProfile({ platform: "freebsd", arch: "x64" });
		assert.equal(profile.id, FALLBACK_PROFILE.id);
	});
});

describe("platform — declared codecs are internally consistent", () => {
	it("every codec resolves to a known family", () => {
		for (const profile of PLATFORM_PROFILES) {
			for (const codec of profile.videoCodecs) {
				assert.doesNotThrow(() => codecFamily(codec), `${profile.id} declares unknown codec ${codec}`);
			}
		}
	});

	it("each profile's default codec is in its own videoCodecs list", () => {
		for (const profile of PLATFORM_PROFILES) {
			assert.ok(profile.videoCodecs.includes(profile.defaults.videoCodec), `${profile.id} default ${profile.defaults.videoCodec} not in its videoCodecs`);
			assert.ok(profile.audioCodecs.includes(profile.defaults.audioCodec), `${profile.id} default audio ${profile.defaults.audioCodec} not in its audioCodecs`);
			assert.ok(
				profile.captureBackends.includes(profile.defaults.captureBackend),
				`${profile.id} default capture ${profile.defaults.captureBackend} not in its captureBackends`
			);
		}
	});

	it("each profile's default encoderPreset is valid for its default codec family", () => {
		for (const profile of PLATFORM_PROFILES) {
			const family = codecFamily(profile.defaults.videoCodec);
			const allowed = ENCODER_PRESETS[family];
			assert.ok(
				allowed?.includes(profile.defaults.encoderPreset),
				`${profile.id} default preset ${profile.defaults.encoderPreset} not valid for family ${family}`
			);
			// And normalize agrees.
			assert.doesNotThrow(() => normalizeEncoderPreset(profile.defaults.videoCodec, profile.defaults.encoderPreset));
		}
	});
});

describe("platform.availableEncoderFamilies / availableEncoderPresets", () => {
	it("darwin exposes only videotoolbox", () => {
		const families = availableEncoderFamilies(DARWIN_LGPL_SHARED);
		assert.deepEqual(families.sort(), ["videotoolbox"]);
		const presets = availableEncoderPresets(DARWIN_LGPL_SHARED);
		assert.deepEqual(Object.keys(presets).sort(), ["videotoolbox"]);
		assert.deepEqual(presets.videotoolbox, ["realtime"]);
	});

	it("win32 exposes nvenc/qsv/svt_av1/libaom_av1/libvpx_vp9 (no software/x264-x265)", () => {
		const families = availableEncoderFamilies(WIN32_BTBN_LGPL_SHARED).sort();
		assert.deepEqual(families, ["libaom_av1", "libvpx_vp9", "nvenc", "qsv", "svt_av1"]);
		assert.ok(!families.includes("software"));
	});

	it("defaultEncoderPresets is a subset of availableEncoderPresets", () => {
		for (const profile of PLATFORM_PROFILES) {
			const defaults = defaultEncoderPresets(profile);
			const available = availableEncoderPresets(profile);
			for (const [family, defaultPreset] of Object.entries(defaults)) {
				assert.ok(available[family]?.includes(defaultPreset), `${profile.id} default preset ${defaultPreset} not in available[${family}]`);
			}
		}
	});
});

describe("defaults.buildDefaultSettings({ profile })", () => {
	it("emits the darwin defaults when given the darwin profile", () => {
		const settings = buildDefaultSettings({ profile: DARWIN_LGPL_SHARED });
		assert.equal(settings.videoCodec, "h264_videotoolbox");
		assert.equal(settings.audioCodec, "aac");
		assert.equal(settings.captureBackend, "avfoundation");
		assert.equal(settings.encoderPreset, "realtime");
	});

	it("emits the win32 defaults when given the win32 profile", () => {
		const settings = buildDefaultSettings({ profile: WIN32_BTBN_LGPL_SHARED });
		assert.equal(settings.videoCodec, "h264_nvenc");
		assert.equal(settings.captureBackend, "gfxcapture");
		assert.equal(settings.encoderPreset, "p6");
	});
});
