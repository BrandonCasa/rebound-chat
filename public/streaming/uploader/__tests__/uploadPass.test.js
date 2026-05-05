import { strict as assert } from "node:assert";
import { setTimeout as sleep } from "node:timers/promises";
import { describe, it } from "node:test";

import { runUploadPass } from "../uploadPass.js";

describe("uploader/runUploadPass", () => {
	it("uploads segments in parallel and playlists after segments in order", async () => {
		const signatures = new Map([
			["C:/tmp/init.mp4", "100:1"],
			["C:/tmp/segment-000001.m4s", "200:1"],
			["C:/tmp/segment-000002.m4s", "300:1"],
			["C:/tmp/video.m3u8", "80:1"],
			["C:/tmp/master.m3u8", "20:1"],
		]);
		const segmentNames = new Set(["segment-000001.m4s", "segment-000002.m4s"]);
		const events = [];
		let activeSegments = 0;
		let maxActiveSegments = 0;
		let finishedSegments = 0;
		const playlistCalls = [];

		const fileSource = {
			async fileSignature(filePath) {
				return signatures.get(filePath) ?? null;
			},
			async readPlaylist(filePath) {
				return `# ${filePath}`;
			},
			openSegmentStream(filePath) {
				return { filePath };
			},
		};

		const fetchImpl = async (url) => {
			const name = decodeURIComponent(url.split("/").pop() || "");
			events.push(`start:${name}`);
			if (segmentNames.has(name)) {
				activeSegments += 1;
				maxActiveSegments = Math.max(maxActiveSegments, activeSegments);
				await sleep(20);
				activeSegments -= 1;
				finishedSegments += 1;
				events.push(`done:${name}`);
				return { ok: true };
			}
			if (name === "video.m3u8" || name === "master.m3u8") {
				assert.equal(finishedSegments, segmentNames.size, "playlist upload started before all segments finished");
				playlistCalls.push(name);
			}
			events.push(`done:${name}`);
			return { ok: true };
		};

		const result = await runUploadPass(
			{
				initFiles: ["C:/tmp/init.mp4"],
				segments: ["C:/tmp/segment-000001.m4s", "C:/tmp/segment-000002.m4s"],
				playlists: ["C:/tmp/video.m3u8", "C:/tmp/master.m3u8"],
			},
			{
				dir: "C:/tmp",
				websiteBaseUrl: "https://example.com",
				sessionId: "session-1",
				ingestSecret: "secret",
				fileSource,
				fetchImpl,
				raiseForStatus: async () => {},
				lastUploaded: new Map(),
				segmentConcurrency: 3,
			}
		);

		assert.ok(maxActiveSegments >= 2, "expected at least two concurrent segment uploads");
		assert.deepEqual(playlistCalls, ["video.m3u8", "master.m3u8"]);
		assert.equal(result.uploadedFiles, 5);
		assert.equal(result.uploadedBytes, 700);
		assert.ok(events.indexOf("done:segment-000001.m4s") < events.indexOf("start:video.m3u8"));
		assert.ok(events.indexOf("done:segment-000002.m4s") < events.indexOf("start:video.m3u8"));
	});
});
