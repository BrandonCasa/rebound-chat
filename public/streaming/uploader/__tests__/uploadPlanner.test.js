import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { planUploadPass } from "../uploadPlanner.js";

describe("uploader/planUploadPass", () => {
	it("buckets init, segments, and playlists in upload-safe order", () => {
		const listing = [
			{ name: "video.m3u8", isFile: true },
			{ name: "segment-000002.m4s", isFile: true },
			{ name: "master.m3u8", isFile: true },
			{ name: "segment-000001.m4s", isFile: true },
			{ name: "init.mp4", isFile: true },
			{ name: "thumb.jpg", isFile: true },
			{ name: "subdir", isFile: false },
		];

		assert.deepEqual(planUploadPass(listing, { initUploaded: false }), {
			initFiles: ["init.mp4"],
			segments: ["segment-000001.m4s", "segment-000002.m4s"],
			playlists: ["video.m3u8", "master.m3u8"],
		});
	});

	it("never re-plans init.mp4 once the state marks it uploaded", () => {
		const listing = [{ name: "init.mp4", isFile: true }];
		assert.deepEqual(planUploadPass(listing, { initUploaded: true }), {
			initFiles: [],
			segments: [],
			playlists: [],
		});
	});
});
