import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { ThumbnailCache } from "../cache.js";

const event = (sourceId, dataUrl = "data:image/png;base64,AAA") => ({
	sourceId,
	dataUrl,
	width: 480,
	height: 270,
	capturedAt: new Date(0).toISOString(),
});

describe("ThumbnailCache", () => {
	it("stores the most recent event per source id", () => {
		const cache = new ThumbnailCache();
		cache.set(event("a", "data:image/png;base64,A1"));
		cache.set(event("a", "data:image/png;base64,A2"));
		assert.equal(cache.get("a").dataUrl, "data:image/png;base64,A2");
	});

	it("reports whether the value changed on set", () => {
		const cache = new ThumbnailCache();
		assert.equal(cache.set(event("a", "data:image/png;base64,X")), true);
		assert.equal(cache.set(event("a", "data:image/png;base64,X")), false);
		assert.equal(cache.set(event("a", "data:image/png;base64,Y")), true);
	});

	it("evicts the least-recently-used entry when over capacity", () => {
		const cache = new ThumbnailCache({ capacity: 2 });
		cache.set(event("a"));
		cache.set(event("b"));
		cache.get("a");
		cache.set(event("c"));
		assert.equal(cache.size, 2);
		assert.equal(cache.get("b"), undefined);
		assert.ok(cache.get("a"));
		assert.ok(cache.get("c"));
	});

	it("snapshot returns only the requested ids in order", () => {
		const cache = new ThumbnailCache();
		cache.set(event("a"));
		cache.set(event("b"));
		cache.set(event("c"));
		const result = cache.snapshot(["c", "a", "missing"]);
		assert.deepEqual(
			result.map((entry) => entry.sourceId),
			["c", "a"]
		);
	});

	it("snapshot with no argument returns every entry", () => {
		const cache = new ThumbnailCache();
		cache.set(event("a"));
		cache.set(event("b"));
		assert.equal(cache.snapshot().length, 2);
	});

	it("delete removes a single entry", () => {
		const cache = new ThumbnailCache();
		cache.set(event("a"));
		cache.delete("a");
		assert.equal(cache.get("a"), undefined);
		assert.equal(cache.size, 0);
	});

	it("rejects invalid capacity", () => {
		assert.throws(() => new ThumbnailCache({ capacity: 0 }), TypeError);
		assert.throws(() => new ThumbnailCache({ capacity: -3 }), TypeError);
		assert.throws(() => new ThumbnailCache({ capacity: 1.5 }), TypeError);
	});
});
