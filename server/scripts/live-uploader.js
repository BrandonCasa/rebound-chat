#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const DEFAULT_SERVER = "https://rebound.nexus";
const DEFAULT_POLL_MS = 1_000;

const SEGMENT_EXTENSIONS = new Set([".aac", ".m4a", ".m4s", ".mp3", ".mp4", ".ts"]);

const PLAYLIST_EXTENSIONS = new Set([".m3u8"]);

const isSegmentFilename = (filename) => SEGMENT_EXTENSIONS.has(path.extname(filename).toLowerCase());

const extractPlaylistSegmentNames = (playlistText) =>
	playlistText
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter((line) => line && !line.startsWith("#"))
		.map((line) => path.basename(line.split("?")[0]))
		.filter((filename) => isSegmentFilename(filename));

const getFileSignature = async (filePath) => {
	const first = await fs.stat(filePath);
	if (!first.isFile() || first.size === 0) return null;

	// Make sure ffmpeg is not still writing/renaming the file.
	await sleep(100);

	const second = await fs.stat(filePath);
	if (!second.isFile() || second.size === 0) return null;

	if (first.size !== second.size || first.mtimeMs !== second.mtimeMs) {
		return null;
	}

	return `${second.size}:${second.mtimeMs}`;
};

const parseArgs = (argv) => {
	const args = {};

	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		if (!arg.startsWith("--")) continue;

		const key = arg.slice(2);
		const nextValue = argv[index + 1];

		if (!nextValue || nextValue.startsWith("--")) {
			args[key] = true;
			continue;
		}

		args[key] = nextValue;
		index += 1;
	}

	return args;
};

const usage = () => {
	console.log(
		[
			"Usage:",
			'  node ./scripts/live-uploader.js --dir ./out/live-hls --token <create-token> [--server https://example.com] [--label "Deck stream"]',
			"",
			"Options:",
			"  --dir               Directory containing ffmpeg-generated HLS files.",
			"  --token             Live ingest create token. Falls back to LIVE_INGEST_CREATE_TOKEN.",
			"  --server            Rebound origin. Defaults to https://rebound.nexus.",
			"  --label             Optional label shown on the share page.",
			"  --poll-ms           Directory polling interval in milliseconds. Default: 1000.",
			"  --retain-segments   Rolling segment retention count to request from the server.",
		].join("\n")
	);
};

const args = parseArgs(process.argv.slice(2));

if (args.help || !args.dir) {
	usage();
	process.exit(args.help ? 0 : 1);
}

const serverOrigin = String(args.server || DEFAULT_SERVER).replace(/\/+$/, "");
const hlsDir = path.resolve(String(args.dir));
const createToken = String(args.token || process.env.LIVE_INGEST_CREATE_TOKEN || "").trim();
const label = String(args.label || "Rebound live stream").trim();
const pollMs = Math.max(250, Number.parseInt(args["poll-ms"], 10) || DEFAULT_POLL_MS);
const retainSegments = Number.parseInt(args["retain-segments"], 10);

if (!createToken) {
	console.error("Missing live ingest create token. Set --token or LIVE_INGEST_CREATE_TOKEN.");
	process.exit(1);
}

const getPriority = (filename) => {
	if (filename === "master.m3u8") return 2;
	if (filename === "video.m3u8") return 1;
	return 0;
};

const listUploadCandidates = async () => {
	const entries = await fs.readdir(hlsDir, { withFileTypes: true });

	return entries
		.filter((entry) => entry.isFile())
		.map((entry) => entry.name)
		.filter((filename) => {
			if (filename === "master.m3u8" || filename === "video.m3u8") {
				return true;
			}

			return SEGMENT_EXTENSIONS.has(path.extname(filename).toLowerCase());
		})
		.sort((left, right) => {
			const priorityDelta = getPriority(left) - getPriority(right);
			if (priorityDelta !== 0) return priorityDelta;
			return left.localeCompare(right);
		});
};

const readErrorMessage = async (response) => {
	try {
		const payload = await response.json();
		return payload.error || JSON.stringify(payload);
	} catch (_err) {
		return response.statusText;
	}
};

const createSession = async () => {
	const response = await fetch(`${serverOrigin}/live/api/session`, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${createToken}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			label,
			...(Number.isFinite(retainSegments) ? { retainSegmentCount: retainSegments } : {}),
		}),
	});

	if (!response.ok) {
		throw new Error(`Failed to create live session: ${await readErrorMessage(response)}`);
	}

	return response.json();
};

const uploadFile = async (session, filename) => {
	const filePath = path.join(hlsDir, filename);
	const fileBody = await fs.readFile(filePath);
	const isPlaylist = filename.endsWith(".m3u8");
	const endpoint =
		filename === "master.m3u8" || filename === "video.m3u8"
			? `/live/api/${session.sessionId}/${filename}`
			: `/live/api/${session.sessionId}/segments/${encodeURIComponent(filename)}`;

	const response = await fetch(`${serverOrigin}${endpoint}`, {
		method: "PUT",
		headers: {
			"x-live-ingest-secret": session.ingestSecret,
			"Content-Type": isPlaylist ? "application/vnd.apple.mpegurl" : "application/octet-stream",
		},
		body: isPlaylist ? fileBody.toString("utf8") : fileBody,
	});

	if (!response.ok) {
		throw new Error(`Failed to upload ${filename}: ${await readErrorMessage(response)}`);
	}
};

const sendHeartbeat = async (session) => {
	const response = await fetch(`${serverOrigin}/live/api/${session.sessionId}/heartbeat`, {
		method: "POST",
		headers: {
			"x-live-ingest-secret": session.ingestSecret,
		},
	});

	if (!response.ok) {
		throw new Error(`Heartbeat failed: ${await readErrorMessage(response)}`);
	}
};

const endSession = async (session) => {
	const response = await fetch(`${serverOrigin}/live/api/${session.sessionId}/end`, {
		method: "POST",
		headers: {
			"x-live-ingest-secret": session.ingestSecret,
		},
	});

	if (!response.ok) {
		throw new Error(`Failed to end live session: ${await readErrorMessage(response)}`);
	}
};

const sleep = (durationMs) =>
	new Promise((resolve) => {
		setTimeout(resolve, durationMs);
	});

const start = async () => {
	const session = await createSession();
	const uploadState = new Map();

	console.log(`Live session: ${session.sessionId}`);
	console.log(`Share page:   ${session.shareUrl}`);
	console.log(`Playback URL: ${session.playbackUrl}`);
	console.log(`Watching:     ${hlsDir}`);

	let stopping = false;
	let loopError = null;

	const heartbeatTimer = setInterval(() => {
		if (stopping) return;

		sendHeartbeat(session).catch((err) => {
			console.error(`[heartbeat] ${err.message}`);
		});
	}, session.heartbeatIntervalMs || 15_000);

	const shutdown = async (exitCode = 0) => {
		if (stopping) return;
		stopping = true;
		clearInterval(heartbeatTimer);

		try {
			await endSession(session);
			console.log("Live session ended.");
		} catch (err) {
			console.error(err.message);
			exitCode = exitCode || 1;
		}

		process.exit(exitCode);
	};

	process.on("SIGINT", () => void shutdown(0));
	process.on("SIGTERM", () => void shutdown(0));

	while (!stopping) {
		try {
			const candidates = await listUploadCandidates();

			for (const filename of candidates) {
				const filePath = path.join(hlsDir, filename);
				const signature = await getFileSignature(filePath);

				if (!signature) continue;

				if (uploadState.get(filename) === signature) {
					continue;
				}

				if (PLAYLIST_EXTENSIONS.has(path.extname(filename).toLowerCase())) {
					const playlistText = await fs.readFile(filePath, "utf8");
					const referencedSegments = extractPlaylistSegmentNames(playlistText);

					const missingUploadedSegments = referencedSegments.filter((segmentName) => {
						return !uploadState.has(segmentName);
					});

					if (missingUploadedSegments.length > 0) {
						//console.log(`[defer] ${filename} waiting for ${missingUploadedSegments.length} segment(s): ${missingUploadedSegments.slice(0, 3).join(", ")}`);
						continue;
					}
				}

				await uploadFile(session, filename);
				uploadState.set(filename, signature);
				//console.log(`[upload] ${filename}`);
			}

			loopError = null;
		} catch (err) {
			if (!loopError || loopError !== err.message) {
				console.error(`[scan] ${err.message}`);
				loopError = err.message;
			}
		}

		await sleep(pollMs);
	}
};

start().catch((err) => {
	console.error(err.message);
	process.exit(1);
});
