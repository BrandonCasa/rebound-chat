/**
 * Helpers for reading and reasoning about the local HLS playlist that
 * FFmpeg writes (`video.m3u8`). Used by the manager to figure out the
 * `start_number` for the next FFmpeg generation so that
 * `EXT-X-MEDIA-SEQUENCE` continues monotonically across an adaptation
 * respawn.
 *
 * The file lives on disk in `config.remoteDir`; we read it
 * synchronously because the manager calls this exactly once per
 * respawn and the playlist is tiny.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

const SEGMENT_FILENAME_PATTERN = /segment-(\d{6})\.m4s/;

const parseSegmentNumber = (line) => {
	const match = SEGMENT_FILENAME_PATTERN.exec(line);
	if (!match) return null;
	const value = Number.parseInt(match[1], 10);
	return Number.isFinite(value) ? value : null;
};

const parseMediaSequence = (line) => {
	const prefix = "#EXT-X-MEDIA-SEQUENCE:";
	if (!line.startsWith(prefix)) return null;
	const value = Number.parseInt(line.slice(prefix.length).trim(), 10);
	return Number.isFinite(value) ? value : null;
};

/**
 * Inspect a media playlist text and return the cursor we need for a
 * post-respawn FFmpeg invocation.
 *
 * `nextStartNumber` is what to feed `-start_number`. Conservative
 * formula: `lastSegmentIndex + 1`, falling back to
 * `mediaSequence + segmentCount` if the playlist hasn't actually
 * referenced any segments yet.
 *
 * @param {string} playlistText
 * @returns {{ nextStartNumber: number, lastSegmentIndex: number | null,
 *             mediaSequence: number | null }}
 */
const parsePlaylistCursor = (playlistText) => {
	if (typeof playlistText !== "string" || !playlistText) {
		return { nextStartNumber: 0, lastSegmentIndex: null, mediaSequence: null };
	}
	const lines = playlistText.split(/\r?\n/);
	let mediaSequence = null;
	let lastSegmentIndex = null;
	let segmentCount = 0;

	for (const line of lines) {
		const seq = parseMediaSequence(line);
		if (seq !== null) {
			mediaSequence = seq;
			continue;
		}
		const segmentIndex = parseSegmentNumber(line);
		if (segmentIndex !== null) {
			lastSegmentIndex = segmentIndex;
			segmentCount += 1;
		}
	}

	let nextStartNumber = 0;
	if (typeof lastSegmentIndex === "number") {
		nextStartNumber = lastSegmentIndex + 1;
	} else if (typeof mediaSequence === "number") {
		nextStartNumber = mediaSequence + segmentCount;
	}

	return { nextStartNumber, lastSegmentIndex, mediaSequence };
};

const readPlaylistCursor = (remoteDir) => {
	if (!remoteDir) return { nextStartNumber: 0, lastSegmentIndex: null, mediaSequence: null };
	try {
		const text = readFileSync(join(remoteDir, "video.m3u8"), "utf8");
		return parsePlaylistCursor(text);
	} catch (_err) {
		return { nextStartNumber: 0, lastSegmentIndex: null, mediaSequence: null };
	}
};

export { parsePlaylistCursor, readPlaylistCursor, SEGMENT_FILENAME_PATTERN };
