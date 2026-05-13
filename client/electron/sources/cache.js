/**
 * In-memory LRU-ish cache for the most recent thumbnail per source id.
 *
 * Pure data structure; no I/O, no timers. Owned by `SourceService` and
 * consumed by both the IPC layer (initial state for the renderer) and
 * the thumbnailer (de-duping identical events before emit).
 *
 * The cache is bounded so a long-running session that touches many
 * windows cannot grow without limit.
 *
 * @typedef {import("./types.js").ThumbnailEvent} ThumbnailEvent
 */

const DEFAULT_CAPACITY = 256;

class ThumbnailCache {
	/**
	 * @param {{ capacity?: number }} [options]
	 */
	constructor({ capacity = DEFAULT_CAPACITY } = {}) {
		if (!Number.isInteger(capacity) || capacity <= 0) {
			throw new TypeError("ThumbnailCache capacity must be a positive integer.");
		}
		this.capacity = capacity;
		/** @type {Map<string, ThumbnailEvent>} */
		this.entries = new Map();
	}

	/**
	 * @param {string} sourceId
	 * @returns {ThumbnailEvent | undefined}
	 */
	get(sourceId) {
		const entry = this.entries.get(sourceId);
		if (!entry) return undefined;

		this.entries.delete(sourceId);
		this.entries.set(sourceId, entry);
		return entry;
	}

	/**
	 * @param {ThumbnailEvent} event
	 * @returns {boolean} true when the value differs from the prior entry.
	 */
	set(event) {
		if (!event || !event.sourceId) return false;

		const previous = this.entries.get(event.sourceId);
		const changed = !previous || previous.dataUrl !== event.dataUrl;

		this.entries.delete(event.sourceId);
		this.entries.set(event.sourceId, event);

		while (this.entries.size > this.capacity) {
			const oldestKey = this.entries.keys().next().value;
			if (oldestKey === undefined) break;
			this.entries.delete(oldestKey);
		}
		return changed;
	}

	/**
	 * @param {string} sourceId
	 */
	delete(sourceId) {
		this.entries.delete(sourceId);
	}

	clear() {
		this.entries.clear();
	}

	/**
	 * @param {string[]} [sourceIds] When omitted, returns every cached entry.
	 * @returns {ThumbnailEvent[]}
	 */
	snapshot(sourceIds) {
		if (!sourceIds) return Array.from(this.entries.values());
		const out = [];
		for (const id of sourceIds) {
			const entry = this.entries.get(id);
			if (entry) out.push(entry);
		}
		return out;
	}

	get size() {
		return this.entries.size;
	}
}

export { ThumbnailCache };
