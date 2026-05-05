import { strict as assert } from "node:assert";
import { mkdtemp, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { setTimeout as sleep } from "node:timers/promises";
import { describe, it } from "node:test";

import { createUploader } from "../index.js";

describe("uploader/createUploader", () => {
	it("starts scheduler + heartbeat, flushes, and stops cleanly", async () => {
		const dir = await mkdtemp(join(tmpdir(), "rebound-uploader-test-"));
		await writeFile(join(dir, "init.mp4"), "init");
		await writeFile(join(dir, "segment-000001.m4s"), "segment");
		await writeFile(join(dir, "video.m3u8"), "#EXTM3U\n");
		await writeFile(join(dir, "master.m3u8"), "#EXTM3U\n");

		const logs = [];
		let passUploads = 0;
		let heartbeatPosts = 0;
		const uploader = createUploader({
			dir,
			websiteBaseUrl: "https://example.com",
			sessionInfo: {
				sessionId: "session-1",
				ingestSecret: "secret",
				heartbeatIntervalMs: 25,
			},
			pollIntervalMs: 20,
			log: (message) => logs.push(message),
			ensureFallbackMasterPlaylist: async () => {},
			raiseForStatus: async () => {},
			fetchImpl: async (url, options) => {
				if (options?.method === "POST" && url.endsWith("/heartbeat")) {
					heartbeatPosts += 1;
				}
				if (options?.method === "PUT") {
					passUploads += 1;
				}
				return { ok: true };
			},
		});

		uploader.start();
		await sleep(90);
		await uploader.flush();
		uploader.stop();
		const heartbeatAfterStop = heartbeatPosts;
		await sleep(40);

		assert.ok(passUploads > 0, "expected at least one upload");
		assert.ok(heartbeatPosts > 0, "expected heartbeat posts");
		assert.equal(heartbeatPosts, heartbeatAfterStop, "heartbeat should stop after uploader.stop()");
		assert.ok(
			logs.some((line) => line.startsWith("uploadPass duration=")),
			"expected per-pass duration logs"
		);
	});
});
