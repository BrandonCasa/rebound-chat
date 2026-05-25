import { basename } from "path";

const extensionForName = (filename) => {
	const index = filename.lastIndexOf(".");
	return index >= 0 ? filename.slice(index).toLowerCase() : "";
};

const mimeTypeForPath = (filePath) => {
	const filename = basename(filePath);
	const extension = extensionForName(filename);
	if (filename === "master.m3u8" || filename === "video.m3u8" || extension === ".m3u8") return "application/vnd.apple.mpegurl";
	if (extension === ".m4s") return "video/iso.segment";
	if (extension === ".mp4") return "video/mp4";
	if (extension === ".ts") return "video/mp2t";
	if (extension === ".aac") return "audio/aac";
	return "application/octet-stream";
};

const createLimit = (maxConcurrency) => {
	const limit = Number.isInteger(maxConcurrency) && maxConcurrency > 0 ? maxConcurrency : 1;
	let active = 0;
	/** @type {Array<() => void>} */
	const queue = [];

	const resume = () => {
		if (active >= limit) return;
		const next = queue.shift();
		if (next) next();
	};

	return (task) =>
		new Promise((resolve, reject) => {
			const run = async () => {
				active += 1;
				try {
					resolve(await task());
				} catch (err) {
					reject(err);
				} finally {
					active -= 1;
					resume();
				}
			};

			if (active < limit) {
				void run();
				return;
			}

			queue.push(() => {
				void run();
			});
		});
};

const durationMs = (startedAt) => Date.now() - startedAt;

const remoteUrlForPath = ({ filePath, sessionId, websiteBaseUrl }) => {
	const filename = basename(filePath);
	const base = `${websiteBaseUrl}/live/api/${sessionId}`;
	if (filename === "master.m3u8") return `${base}/master.m3u8`;
	if (filename === "video.m3u8") return `${base}/video.m3u8`;
	return `${base}/segments/${encodeURIComponent(filename)}`;
};

/**
 * @typedef {Object} UploadPassResult
 * @property {number} uploadedFiles
 * @property {number} uploadedBytes
 * @property {{ phaseA: number, phaseB: number, phaseC: number, total: number }} durations
 */

/**
 * @param {{ initFiles: string[], segments: string[], playlists: string[] }} plan
 * @param {{
 *   dir: string,
 *   websiteBaseUrl: string,
 *   sessionId: string,
 *   ingestSecret: string,
 *   fileSource: {
 *     fileSignature: (filePath: string) => Promise<string|null>,
 *     readPlaylist: (filePath: string) => Promise<string>,
 *     openSegmentStream: (filePath: string) => ReadableStream
 *   },
 *   fetchImpl?: typeof fetch,
 *   raiseForStatus: (response: Response) => Promise<unknown>,
 *   dispatcher?: unknown,
 *   lastUploaded: Map<string, string>,
 *   segmentConcurrency?: number,
 *   onUpload?: (filePath: string) => void
 * }} ctx
 * @returns {Promise<UploadPassResult>}
 */
export async function runUploadPass(plan, ctx) {
	const fetchImpl = ctx.fetchImpl || fetch;
	const startedAt = Date.now();
	const durations = { phaseA: 0, phaseB: 0, phaseC: 0, total: 0 };
	let uploadedFiles = 0;
	let uploadedBytes = 0;

	const uploadOne = async (filePath) => {
		const signature = await ctx.fileSource.fileSignature(filePath);
		if (!signature || ctx.lastUploaded.get(filePath) === signature) return;

		const filename = basename(filePath);
		const isPlaylist = extensionForName(filename) === ".m3u8";
		const body = isPlaylist ? await ctx.fileSource.readPlaylist(filePath) : ctx.fileSource.openSegmentStream(filePath);
		const response = await fetchImpl(
			remoteUrlForPath({
				filePath,
				sessionId: ctx.sessionId,
				websiteBaseUrl: ctx.websiteBaseUrl,
			}),
			{
				method: "PUT",
				headers: {
					"Content-Type": mimeTypeForPath(filePath),
					"X-Live-Ingest-Secret": ctx.ingestSecret,
				},
				body,
				...(ctx.dispatcher ? { dispatcher: ctx.dispatcher } : {}),
				...(isPlaylist ? {} : { duplex: "half" }),
			}
		);
		await ctx.raiseForStatus(response);
		ctx.lastUploaded.set(filePath, signature);
		uploadedFiles += 1;
		const sizePart = Number.parseInt(signature.split(":")[0], 10);
		if (Number.isFinite(sizePart)) {
			uploadedBytes += sizePart;
		}
		if (typeof ctx.onUpload === "function") {
			ctx.onUpload(filePath);
		}
	};

	const phaseAStarted = Date.now();
	for (const filePath of plan.initFiles) {
		await uploadOne(filePath);
	}
	durations.phaseA = durationMs(phaseAStarted);

	const phaseBStarted = Date.now();
	const limit = createLimit(ctx.segmentConcurrency || 3);
	await Promise.all(plan.segments.map((filePath) => limit(() => uploadOne(filePath))));
	durations.phaseB = durationMs(phaseBStarted);

	const phaseCStarted = Date.now();
	for (const filePath of plan.playlists) {
		await uploadOne(filePath);
	}
	durations.phaseC = durationMs(phaseCStarted);
	durations.total = durationMs(startedAt);

	return {
		uploadedFiles,
		uploadedBytes,
		durations,
	};
}
