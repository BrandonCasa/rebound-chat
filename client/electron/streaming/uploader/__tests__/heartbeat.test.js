import { strict as assert } from "node:assert";
import { setTimeout as sleep } from "node:timers/promises";
import { describe, it } from "node:test";

import { createHeartbeat } from "../heartbeat.js";

describe("uploader/createHeartbeat", () => {
	it("ticks on its own interval and stops cleanly", async () => {
		let beats = 0;
		const heartbeat = createHeartbeat({
			intervalMs: 20,
			log: () => {},
			sendHeartbeat: async () => {
				beats += 1;
			},
		});

		heartbeat.start();
		await sleep(70);
		heartbeat.stop();
		const beatsAfterStop = beats;
		await sleep(50);

		assert.ok(beatsAfterStop >= 3, `expected multiple heartbeat ticks, got ${beatsAfterStop}`);
		assert.equal(beats, beatsAfterStop, "heartbeat should not tick after stop");
	});
});
