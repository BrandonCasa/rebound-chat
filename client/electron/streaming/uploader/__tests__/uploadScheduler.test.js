import { strict as assert } from "node:assert";
import { setTimeout as sleep } from "node:timers/promises";
import { describe, it } from "node:test";

import { createScheduler } from "../uploadScheduler.js";

describe("uploader/createScheduler", () => {
	it("schedules catch-up immediately after a slow pass", async () => {
		const starts = [];
		let runCount = 0;
		let done;
		const donePromise = new Promise((resolve) => {
			done = resolve;
		});
		const scheduler = createScheduler({
			intervalMs: 15,
			log: () => {},
			runPass: async () => {
				starts.push(Date.now());
				runCount += 1;
				await sleep(35);
				if (runCount >= 2) done();
			},
		});

		scheduler.start();
		await donePromise;
		scheduler.stop();

		assert.ok(starts.length >= 2);
		const delta = starts[1] - starts[0];
		assert.ok(delta < 85, `expected immediate catch-up for slow pass, got ${delta}ms`);
	});

	it("preserves cadence when pass is faster than interval", async () => {
		const starts = [];
		let done;
		const donePromise = new Promise((resolve) => {
			done = resolve;
		});
		let runs = 0;
		const scheduler = createScheduler({
			intervalMs: 40,
			log: () => {},
			runPass: async () => {
				starts.push(Date.now());
				runs += 1;
				await sleep(8);
				if (runs >= 2) done();
			},
		});

		scheduler.start();
		await donePromise;
		scheduler.stop();

		const delta = starts[1] - starts[0];
		assert.ok(delta >= 30 && delta <= 75, `expected cadence-preserving gap, got ${delta}ms`);
	});
});
