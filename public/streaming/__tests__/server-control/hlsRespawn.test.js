import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { buildArgs as buildHlsArgs } from "../../output/hls.js";
import { withDefaults } from "../fixtures/configs.js";

describe("HLS output respawn flags", () => {
	it("produces stable argv when no respawn options are passed (legacy first-generation)", () => {
		const args = buildHlsArgs(withDefaults());
		assert.ok(args.includes("delete_segments+independent_segments+temp_file"));
		assert.equal(args.includes("-start_number"), false);
	});

	it("adds discont_start to the flags list on respawn", () => {
		const args = buildHlsArgs(withDefaults(), { discontStart: true });
		const flagsIndex = args.indexOf("-hls_flags");
		assert.notEqual(flagsIndex, -1);
		const flagsValue = args[flagsIndex + 1];
		assert.ok(flagsValue.includes("discont_start"));
		assert.ok(flagsValue.includes("delete_segments"));
		assert.ok(flagsValue.includes("independent_segments"));
		assert.ok(flagsValue.includes("temp_file"));
	});

	it("includes -start_number when a positive integer is supplied", () => {
		const args = buildHlsArgs(withDefaults(), { discontStart: true, startNumber: 1234 });
		const startNumberIndex = args.indexOf("-start_number");
		assert.notEqual(startNumberIndex, -1);
		assert.equal(args[startNumberIndex + 1], "1234");
	});

	it("omits -start_number when startNumber is 0 (FFmpeg default)", () => {
		const args = buildHlsArgs(withDefaults(), { discontStart: true, startNumber: 0 });
		assert.equal(args.includes("-start_number"), false);
	});
});
