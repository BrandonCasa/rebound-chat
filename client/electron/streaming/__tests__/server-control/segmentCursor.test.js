import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { parsePlaylistCursor } from "../../server-control/segmentCursor.js";

describe("parsePlaylistCursor", () => {
	it("returns zeros for an empty playlist", () => {
		const result = parsePlaylistCursor("");
		assert.deepEqual(result, { nextStartNumber: 0, lastSegmentIndex: null, mediaSequence: null });
	});

	it("computes next start number from the highest segment seen", () => {
		const playlist = [
			"#EXTM3U",
			"#EXT-X-VERSION:7",
			"#EXT-X-TARGETDURATION:2",
			"#EXT-X-MEDIA-SEQUENCE:42",
			'#EXT-X-MAP:URI="init.mp4"',
			"#EXTINF:2.000000,",
			"segment-000042.m4s",
			"#EXTINF:2.000000,",
			"segment-000043.m4s",
			"#EXTINF:2.000000,",
			"segment-000044.m4s",
			"",
		].join("\n");

		const result = parsePlaylistCursor(playlist);
		assert.equal(result.lastSegmentIndex, 44);
		assert.equal(result.nextStartNumber, 45);
		assert.equal(result.mediaSequence, 42);
	});

	it("falls back to media sequence + segment count when no segment URIs match the regex", () => {
		const playlist = ["#EXTM3U", "#EXT-X-MEDIA-SEQUENCE:10", "#EXTINF:2,", "unusual-name-001.ts", "#EXTINF:2,", "unusual-name-002.ts"].join("\n");

		const result = parsePlaylistCursor(playlist);
		assert.equal(result.lastSegmentIndex, null);
		assert.equal(result.mediaSequence, 10);
		assert.equal(result.nextStartNumber, 10);
	});
});
