import { readdir } from "fs/promises";
import { join } from "path";

import { createHeartbeat } from "./heartbeat.js";
import { fileSignature, openSegmentStream, readPlaylist } from "./fileSource.js";
import { uploadAgent } from "./httpClient.js";
import { runUploadPass } from "./uploadPass.js";
import { planUploadPass } from "./uploadPlanner.js";
import { createScheduler } from "./uploadScheduler.js";

const DEFAULT_POLL_INTERVAL_MS = 750;
const MIN_DIRECTORY_SCAN_INTERVAL_MS = 250;

const defaultFileSource = {
	fileSignature,
	openSegmentStream,
	readPlaylist,
};

const mapListingToPlanEntries = (entries) => entries.filter((entry) => entry.isFile()).map((entry) => ({ name: entry.name, isFile: true }));

export function createUploader({
	dir,
	websiteBaseUrl,
	sessionInfo,
	log,
	pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
	ensureFallbackMasterPlaylist,
	fetchImpl = fetch,
	raiseForStatus,
	dispatcher = uploadAgent,
	fileSource = defaultFileSource,
	segmentConcurrency = 3,
}) {
	const lastUploaded = new Map();
	let scheduler = null;
	let heartbeat = null;
	let initUploaded = false;
	let fallbackMasterEnsured = false;
	let cachedListing = [];
	let lastListingAt = 0;

	const sendHeartbeat = async () => {
		const response = await fetchImpl(`${websiteBaseUrl}/live/api/${sessionInfo.sessionId}/heartbeat`, {
			method: "POST",
			headers: {
				"X-Live-Ingest-Secret": sessionInfo.ingestSecret,
			},
			...(dispatcher ? { dispatcher } : {}),
		});
		await raiseForStatus(response);
	};

	const readListing = async () => {
		if (pollIntervalMs < MIN_DIRECTORY_SCAN_INTERVAL_MS) {
			const elapsed = Date.now() - lastListingAt;
			if (elapsed < MIN_DIRECTORY_SCAN_INTERVAL_MS && cachedListing.length > 0) {
				return cachedListing;
			}
		}

		try {
			cachedListing = await readdir(dir, { withFileTypes: true });
			lastListingAt = Date.now();
			return cachedListing;
		} catch (_err) {
			cachedListing = [];
			lastListingAt = Date.now();
			return [];
		}
	};

	const runPass = async () => {
		const passStartedAt = Date.now();
		if (!fallbackMasterEnsured) {
			await ensureFallbackMasterPlaylist();
			fallbackMasterEnsured = true;
		}

		const listing = await readListing();
		const plan = planUploadPass(mapListingToPlanEntries(listing), { initUploaded });
		const toAbsolutePath = (name) => join(dir, name);
		const result = await runUploadPass(
			{
				initFiles: plan.initFiles.map(toAbsolutePath),
				segments: plan.segments.map(toAbsolutePath),
				playlists: plan.playlists.map(toAbsolutePath),
			},
			{
				dir,
				websiteBaseUrl,
				sessionId: sessionInfo.sessionId,
				ingestSecret: sessionInfo.ingestSecret,
				fileSource,
				fetchImpl,
				raiseForStatus,
				dispatcher,
				lastUploaded,
				segmentConcurrency,
				onUpload(filePath) {
					const filename = filePath.split(/[\\/]/).pop();
					if (filename === "init.mp4") initUploaded = true;
					log?.(`Uploaded: ${filename}`);
				},
			}
		);

		const total = Date.now() - passStartedAt;
		log?.(
			`uploadPass duration=${total}ms files=${result.uploadedFiles} bytes=${result.uploadedBytes} phaseA=${result.durations.phaseA}ms phaseB=${result.durations.phaseB}ms phaseC=${result.durations.phaseC}ms`
		);
	};

	return {
		start() {
			if (!scheduler) {
				scheduler = createScheduler({
					runPass,
					intervalMs: pollIntervalMs,
					log,
				});
				scheduler.start();
			}

			if (!heartbeat) {
				heartbeat = createHeartbeat({
					sendHeartbeat,
					intervalMs: sessionInfo.heartbeatIntervalMs || 15000,
					log,
				});
				heartbeat.start();
			}
		},
		async flush() {
			await runPass();
		},
		stop() {
			scheduler?.stop();
			scheduler = null;
			heartbeat?.stop();
			heartbeat = null;
		},
	};
}
