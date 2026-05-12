import crypto from "crypto";

import logger from "../logger.js";
import StreamSessionModel from "../models/StreamSession.js";
import { liveConfig } from "./config.js";
import { PLAYLIST_CONTENT_TYPE, resolveHlsContentType } from "./mime.js";
import { normalizeMasterPlaylist, normalizeMediaPlaylist, sanitizeUploadedFilename } from "./playlist.js";
import { createLiveStorage } from "./storage.js";

class LiveServiceError extends Error {
	constructor(status, message, code = "live_error") {
		super(message);
		this.status = status;
		this.code = code;
	}
}

const hashSecret = (value) => crypto.createHash("sha256").update(String(value)).digest("hex");

const generateToken = (bytes = 24) => crypto.randomBytes(bytes).toString("base64url");

const mergeRecentSegmentNames = (existingNames, incomingNames, maxCount) => {
	const orderedNames = [];

	for (const name of [...(existingNames || []), ...(incomingNames || [])]) {
		if (!name) continue;

		const existingIndex = orderedNames.indexOf(name);
		if (existingIndex >= 0) {
			orderedNames.splice(existingIndex, 1);
		}

		orderedNames.push(name);
	}

	return orderedNames.slice(-maxCount);
};

const toValidationError = (err, fallbackMessage = "Invalid live stream payload.") => {
	if (err instanceof LiveServiceError) {
		return err;
	}

	return new LiveServiceError(422, err?.message || fallbackMessage, "live_validation_error");
};

const toIsoStringOrNull = (value) => {
	if (!value) return null;
	const date = value instanceof Date ? value : new Date(value);
	return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const toIdStringOrNull = (value) => {
	if (!value) return null;
	if (value._id) return value._id.toString();
	if (typeof value.toString === "function") return value.toString();
	return null;
};

const parseNumber = (value) => {
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : null;
};

const parseAttributeList = (value = "") => {
	const attributes = {};
	let key = "";
	let token = "";
	let inQuote = false;
	let readingKey = true;

	const commit = () => {
		const cleanKey = key.trim();
		if (!cleanKey) return;

		const cleanToken = token.trim();
		attributes[cleanKey] = cleanToken.replace(/^"|"$/g, "");
		key = "";
		token = "";
		readingKey = true;
	};

	for (const char of value) {
		if (char === '"') {
			inQuote = !inQuote;
			token += char;
			continue;
		}

		if (!inQuote && char === "=" && readingKey) {
			readingKey = false;
			continue;
		}

		if (!inQuote && char === ",") {
			commit();
			continue;
		}

		if (readingKey) {
			key += char;
		} else {
			token += char;
		}
	}

	commit();
	return attributes;
};

const parseMasterPlaylistInfo = (playlistText = "") => {
	const lines = String(playlistText || "")
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean);
	const variantLine = lines.find((line) => line.startsWith("#EXT-X-STREAM-INF:"));

	if (!variantLine) {
		return null;
	}

	const attributes = parseAttributeList(variantLine.slice("#EXT-X-STREAM-INF:".length));
	return {
		bandwidth: parseNumber(attributes.BANDWIDTH),
		averageBandwidth: parseNumber(attributes["AVERAGE-BANDWIDTH"]),
		codecs: attributes.CODECS || "",
		resolution: attributes.RESOLUTION || "",
		frameRate: parseNumber(attributes["FRAME-RATE"]),
		videoRange: attributes["VIDEO-RANGE"] || "",
	};
};

const parseMediaPlaylistInfo = (playlistText = "") => {
	const lines = String(playlistText || "")
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean);
	const segments = [];
	let pendingDuration = null;
	let targetDuration = null;
	let mediaSequence = null;
	let mapUri = "";
	let hasEndList = false;
	let independentSegments = false;

	for (const line of lines) {
		if (line.startsWith("#EXT-X-TARGETDURATION:")) {
			targetDuration = parseNumber(line.slice("#EXT-X-TARGETDURATION:".length));
			continue;
		}

		if (line.startsWith("#EXT-X-MEDIA-SEQUENCE:")) {
			mediaSequence = parseNumber(line.slice("#EXT-X-MEDIA-SEQUENCE:".length));
			continue;
		}

		if (line.startsWith("#EXT-X-MAP:")) {
			mapUri = parseAttributeList(line.slice("#EXT-X-MAP:".length)).URI || "";
			continue;
		}

		if (line.startsWith("#EXTINF:")) {
			pendingDuration = parseNumber(line.slice("#EXTINF:".length).split(",")[0]);
			continue;
		}

		if (line === "#EXT-X-ENDLIST") {
			hasEndList = true;
			continue;
		}

		if (line === "#EXT-X-INDEPENDENT-SEGMENTS") {
			independentSegments = true;
			continue;
		}

		if (!line.startsWith("#")) {
			segments.push({
				uri: line,
				duration: pendingDuration,
			});
			pendingDuration = null;
		}
	}

	const totalDuration = segments.reduce((sum, segment) => sum + (Number.isFinite(segment.duration) ? segment.duration : 0), 0);
	const latestSegment = segments[segments.length - 1] || null;

	return {
		targetDuration,
		mediaSequence,
		segmentCount: segments.length,
		totalDuration,
		latestSegmentUri: latestSegment?.uri || "",
		firstSegmentUri: segments[0]?.uri || "",
		mapUri,
		hasEndList,
		independentSegments,
	};
};

const serializeAsset = (asset) => {
	if (!asset) return null;

	return {
		filename: asset.filename,
		assetKind: asset.assetKind,
		contentType: asset.contentType,
		byteSize: asset.byteSize,
		createdAt: toIsoStringOrNull(asset.createdAt),
		updatedAt: toIsoStringOrNull(asset.updatedAt),
		lastServedAt: toIsoStringOrNull(asset.lastServedAt),
	};
};

class LiveService {
	constructor(config = liveConfig) {
		this.config = config;
		this.storage = createLiveStorage(config);
	}

	buildOrigin(req) {
		const forwardedProto = req.get("x-forwarded-proto");
		const forwardedHost = req.get("x-forwarded-host");
		const protocol = (forwardedProto || req.protocol || "http").split(",")[0].trim();
		const host = (forwardedHost || req.get("host") || "").split(",")[0].trim();
		return host ? `${protocol}://${host}` : "";
	}

	buildStorageKey(session, filename) {
		if (filename === "master.m3u8" || filename === "video.m3u8") {
			return `${session.storagePrefix}/${filename}`;
		}

		return `${session.storagePrefix}/segments/${filename}`;
	}

	buildUrl(origin, path) {
		return origin ? `${origin}${path}` : path;
	}

	resolveSessionTransportMode(session) {
		const mode = String(session.transportMode || this.config.transportDefault || "hls").toLowerCase();
		return ["hls", "webrtc", "hybrid"].includes(mode) ? mode : "hls";
	}

	createTransportEnvelope(session, ingestSecret, origin = "") {
		const mode = this.resolveSessionTransportMode(session);
		const playbackUrl = this.buildUrl(origin, session.playbackPath);
		const shareUrl = this.buildUrl(origin, session.sharePath);
		const ingestBaseUrl = this.buildUrl(origin, `/live/api/${session.sessionId}`);
		const webrtcReason = mode === "hls" ? "hls_default" : "livekit_token_layer_not_enabled";

		return {
			transport: {
				mode,
				default: this.config.transportDefault || "hls",
				hls: {
					available: true,
				},
				webrtc: {
					available: false,
					reason: webrtcReason,
				},
			},
			control: {
				heartbeatIntervalMs: this.config.heartbeatIntervalMs,
				endpoints: {
					heartbeatUrl: `${ingestBaseUrl}/heartbeat`,
					endUrl: `${ingestBaseUrl}/end`,
				},
			},
			ingest: {
				hls: {
					available: true,
					protocol: "hls",
					sessionId: session.sessionId,
					ingestSecret,
					uploadBaseUrl: ingestBaseUrl,
					masterPlaylistUrl: `${ingestBaseUrl}/master.m3u8`,
					mediaPlaylistUrl: `${ingestBaseUrl}/video.m3u8`,
					segmentBaseUrl: `${ingestBaseUrl}/segments`,
				},
				webrtc: {
					available: false,
					reason: webrtcReason,
				},
			},
			playback: {
				hls: {
					available: true,
					protocol: "hls",
					url: playbackUrl,
					path: session.playbackPath,
				},
				webrtc: {
					available: false,
					reason: webrtcReason,
				},
			},
			shareUrl,
		};
	}

	createSessionResponse(session, ingestSecret, origin = "") {
		const envelope = this.createTransportEnvelope(session, ingestSecret, origin);

		return {
			sessionId: session.sessionId,
			publicToken: session.publicToken,
			ingestSecret,
			status: session.status,
			heartbeatIntervalMs: this.config.heartbeatIntervalMs,
			expiresAt: session.expiresAt,
			playbackUrl: envelope.playback.hls.url,
			shareUrl: envelope.shareUrl,
			transport: envelope.transport,
			control: envelope.control,
			ingest: envelope.ingest,
			playback: envelope.playback,
		};
	}

	createAssetMediaInfo(session) {
		const assets = session.assets || [];
		const masterAsset = assets.find((asset) => asset.filename === "master.m3u8" && asset.assetKind === "master");
		const mediaAsset = assets.find((asset) => asset.filename === "video.m3u8" && asset.assetKind === "media-playlist");
		const segmentAssets = assets.filter((asset) => asset.assetKind === "segment");
		const recentSegmentNames = [...(session.recentSegmentNames || [])];
		const latestSegmentName = recentSegmentNames[recentSegmentNames.length - 1] || "";
		const latestSegment =
			segmentAssets.find((asset) => asset.filename === latestSegmentName) ||
			[...segmentAssets].sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime())[0];

		return {
			storageBackend: session.storageBackend,
			maxRetainedSegments: session.maxRetainedSegments,
			retainedSegmentNames: recentSegmentNames,
			retainedSegmentCount: recentSegmentNames.length,
			assetCount: assets.length,
			totalRetainedBytes: assets.reduce((sum, asset) => sum + (asset.byteSize || 0), 0),
			latestSegment: serializeAsset(latestSegment),
			playlists: {
				master: serializeAsset(masterAsset),
				media: serializeAsset(mediaAsset),
			},
			masterPlaylist: null,
			mediaPlaylist: null,
		};
	}

	async readPlaylistInfo(session, filename, parser) {
		const asset = (session.assets || []).find((candidate) => candidate.filename === filename);
		if (!asset) return null;

		try {
			const storedObject = await this.storage.readObject(asset.storageKey);
			return parser(storedObject.body.toString("utf8"));
		} catch (err) {
			logger.warn(`[live] failed to read ${filename} metadata for sessionId=${session.sessionId}: ${err.message}`);
			return null;
		}
	}

	async createMediaInfo(session) {
		const baseInfo = this.createAssetMediaInfo(session);
		const [masterPlaylist, mediaPlaylist] = await Promise.all([
			this.readPlaylistInfo(session, "master.m3u8", parseMasterPlaylistInfo),
			this.readPlaylistInfo(session, "video.m3u8", parseMediaPlaylistInfo),
		]);

		return {
			...baseInfo,
			masterPlaylist,
			mediaPlaylist,
		};
	}

	createShareSummary(session, origin = "", mediaInfo = null) {
		const hasMasterPlaylist = session.assets.some((asset) => asset.filename === "master.m3u8" && asset.assetKind === "master");
		const hasMediaPlaylist = session.assets.some((asset) => asset.filename === "video.m3u8" && asset.assetKind === "media-playlist");

		return {
			sessionId: session.sessionId,
			label: session.label,
			createdByUser: toIdStringOrNull(session.createdByUser),
			createdByUsername: session.createdByUsername || "",
			status: session.status,
			createdAt: session.createdAt,
			lastHeartbeatAt: session.lastHeartbeatAt,
			expiresAt: session.expiresAt,
			endedAt: session.endedAt,
			playbackUrl: this.buildUrl(origin, session.playbackPath),
			shareUrl: this.buildUrl(origin, session.sharePath),
			transport: {
				mode: this.resolveSessionTransportMode(session),
			},
			recentSegmentCount: session.recentSegmentNames.length,
			hasMasterPlaylist,
			hasMediaPlaylist,
			isPlayable: session.status === "active" && hasMasterPlaylist && hasMediaPlaylist,
			mediaInfo: mediaInfo || this.createAssetMediaInfo(session),
		};
	}

	async createDetailedShareSummary(session, origin = "") {
		return this.createShareSummary(session, origin, await this.createMediaInfo(session));
	}

	async listShareSummaries(origin = "", { limit = 100 } = {}) {
		const resolvedLimit = Math.min(200, Math.max(1, Number.parseInt(limit, 10) || 100));
		const sessions = await StreamSessionModel.find({}).sort({ updatedAt: -1 }).limit(resolvedLimit);
		const summaries = [];

		for (const session of sessions) {
			if (session.status === "active" && session.expiresAt <= new Date()) {
				await this.markSessionExpired(session, "stream_list_timeout");
			}

			summaries.push(await this.createDetailedShareSummary(session, origin));
		}

		const statusWeight = {
			active: 0,
			ended: 1,
			expired: 2,
		};

		return summaries.sort((left, right) => {
			const statusDelta = (statusWeight[left.status] ?? 3) - (statusWeight[right.status] ?? 3);
			if (statusDelta !== 0) return statusDelta;
			return new Date(right.lastHeartbeatAt).getTime() - new Date(left.lastHeartbeatAt).getTime();
		});
	}

	async expireInactiveAccountSessions(userId, now = new Date()) {
		if (!userId) return [];

		const activeSessions = await StreamSessionModel.find({
			createdByUser: userId,
			status: "active",
		});

		const stillActive = [];
		for (const session of activeSessions) {
			if (session.expiresAt <= now) {
				await this.markSessionExpired(session, "account_session_create_timeout");
			} else {
				stillActive.push(session);
			}
		}

		return stillActive;
	}

	async createSession({
		label = "",
		createdByIp = "",
		requestedRetainedSegments = null,
		createdByUser = null,
		createdByUsername = "",
		enforceSingleUserActive = false,
	} = {}) {
		const now = new Date();
		const createdByUserId = toIdStringOrNull(createdByUser);
		const normalizedAccountLabel = String(createdByUsername || "")
			.trim()
			.slice(0, 120);
		const normalizedLabel = String(label || "")
			.trim()
			.slice(0, 120);

		if (enforceSingleUserActive && createdByUserId) {
			const activeAccountSessions = await this.expireInactiveAccountSessions(createdByUserId, now);
			if (activeAccountSessions.length > 0) {
				throw new LiveServiceError(409, "This account already has an active live stream.", "account_live_stream_limit");
			}
		}

		const expiresAt = new Date(now.getTime() + this.config.sessionTtlMs);
		const cleanupAfterAt = new Date(expiresAt);
		const sessionId = generateToken(12);
		const publicToken = generateToken(24);
		const ingestSecret = generateToken(32);
		const maxRetainedSegments = Math.min(
			this.config.maxRetainedSegmentsCap,
			Math.max(1, Number.parseInt(requestedRetainedSegments, 10) || this.config.maxRetainedSegments)
		);

		const session = await StreamSessionModel.create({
			sessionId,
			label: normalizedAccountLabel || normalizedLabel,
			publicToken,
			ingestSecretHash: hashSecret(ingestSecret),
			createdByIp,
			createdByUser: createdByUserId,
			createdByUsername: normalizedAccountLabel,
			lastHeartbeatAt: now,
			expiresAt,
			cleanupAfterAt,
			status: "active",
			transportMode: this.config.transportDefault || "hls",
			playbackPath: `/live/watch/${publicToken}/master.m3u8`,
			sharePath: `/live/share/${publicToken}`,
			storageBackend: this.config.storageBackend,
			storagePrefix: `sessions/${sessionId}`,
			maxRetainedSegments,
			recentSegmentNames: [],
			assets: [],
		});

		logger.info(`[live] session created sessionId=${session.sessionId} token=${session.publicToken}`);

		return { session, ingestSecret };
	}

	async markSessionExpired(session, reason = "session_ttl_elapsed") {
		if (!session || session.status !== "active") return session;

		const now = new Date();
		session.status = "expired";
		session.endedAt = session.endedAt || now;
		session.expiresAt = now;
		session.cleanupAfterAt = new Date(now.getTime() + this.config.endedSessionRetentionMs);
		await session.save();

		logger.info(`[live] session expired sessionId=${session.sessionId} reason=${reason}`);

		return session;
	}

	async ensureSessionIsActive(session, reason = "session_inactive") {
		if (!session) {
			throw new LiveServiceError(404, "Live session not found.", "live_session_not_found");
		}

		if (session.status === "active" && session.expiresAt <= new Date()) {
			await this.markSessionExpired(session, "heartbeat_timeout");
		}

		if (session.status !== "active") {
			throw new LiveServiceError(410, `Live session is ${session.status}.`, "live_session_inactive");
		}

		return session;
	}

	async authenticateIngestSession(sessionId, ingestSecret) {
		if (!ingestSecret) {
			throw new LiveServiceError(401, "Missing ingest secret.", "missing_ingest_secret");
		}

		const session = await StreamSessionModel.findOne({ sessionId });
		await this.ensureSessionIsActive(session, "authenticate_ingest_session");

		const expectedHash = Buffer.from(session.ingestSecretHash, "hex");
		const providedHash = Buffer.from(hashSecret(ingestSecret), "hex");
		if (expectedHash.length !== providedHash.length || !crypto.timingSafeEqual(expectedHash, providedHash)) {
			throw new LiveServiceError(401, "Invalid ingest secret.", "invalid_ingest_secret");
		}

		return session;
	}

	async touchSession(session) {
		const now = new Date();
		session.lastHeartbeatAt = now;
		session.expiresAt = new Date(now.getTime() + this.config.sessionTtlMs);
		session.cleanupAfterAt = new Date(session.expiresAt);
	}

	upsertAssetMetadata(session, assetMetadata) {
		const now = new Date();
		const existingAsset = session.assets.find((asset) => asset.filename === assetMetadata.filename);

		if (existingAsset) {
			existingAsset.storageKey = assetMetadata.storageKey;
			existingAsset.assetKind = assetMetadata.assetKind;
			existingAsset.contentType = assetMetadata.contentType;
			existingAsset.byteSize = assetMetadata.byteSize;
			existingAsset.updatedAt = now;
			return existingAsset;
		}

		session.assets.push({
			...assetMetadata,
			createdAt: now,
			updatedAt: now,
			lastServedAt: null,
		});

		return session.assets[session.assets.length - 1];
	}

	async pruneSegments(session) {
		const keepFilenames = new Set(session.recentSegmentNames);
		const staleSegments = session.assets.filter((asset) => asset.assetKind === "segment" && !keepFilenames.has(asset.filename));

		if (!staleSegments.length) {
			return;
		}

		await this.storage.deleteObjects(staleSegments.map((asset) => asset.storageKey));
		session.assets = session.assets.filter((asset) => asset.assetKind !== "segment" || keepFilenames.has(asset.filename));
	}

	async uploadMasterPlaylist(session, rawPlaylist) {
		let playlistText;
		try {
			playlistText = normalizeMasterPlaylist(rawPlaylist);
		} catch (err) {
			throw toValidationError(err, "Invalid master playlist.");
		}
		const storageKey = this.buildStorageKey(session, "master.m3u8");
		const playlistBuffer = Buffer.from(playlistText, "utf8");

		await this.storage.writeBuffer(storageKey, playlistBuffer);

		this.upsertAssetMetadata(session, {
			filename: "master.m3u8",
			storageKey,
			assetKind: "master",
			contentType: PLAYLIST_CONTENT_TYPE,
			byteSize: playlistBuffer.length,
		});

		await this.touchSession(session);
		await session.save();
	}

	async uploadMediaPlaylist(session, rawPlaylist) {
		let playlistText;
		let referencedSegmentNames;
		try {
			({ playlistText, referencedSegmentNames } = normalizeMediaPlaylist(rawPlaylist));
		} catch (err) {
			throw toValidationError(err, "Invalid media playlist.");
		}
		const retentionCount = Math.max(session.maxRetainedSegments, referencedSegmentNames.length);
		const storageKey = this.buildStorageKey(session, "video.m3u8");
		const playlistBuffer = Buffer.from(playlistText, "utf8");

		await this.storage.writeBuffer(storageKey, playlistBuffer);

		session.recentSegmentNames = mergeRecentSegmentNames(session.recentSegmentNames, referencedSegmentNames, retentionCount);

		this.upsertAssetMetadata(session, {
			filename: "video.m3u8",
			storageKey,
			assetKind: "media-playlist",
			contentType: PLAYLIST_CONTENT_TYPE,
			byteSize: playlistBuffer.length,
		});

		await this.pruneSegments(session);
		await this.touchSession(session);
		await session.save();
	}

	async uploadSegment(session, rawFilename, rawBody) {
		let filename;
		try {
			filename = sanitizeUploadedFilename(rawFilename);
		} catch (err) {
			throw toValidationError(err, "Invalid segment filename.");
		}
		if (!Buffer.isBuffer(rawBody)) {
			throw new LiveServiceError(422, "Segment body must be binary data.", "invalid_segment_body_type");
		}
		const body = rawBody;
		if (!body.length) {
			throw new LiveServiceError(422, "Segment body is required.", "missing_segment_body");
		}

		const contentType = resolveHlsContentType(filename);
		const storageKey = this.buildStorageKey(session, filename);

		await this.storage.writeBuffer(storageKey, body);

		session.recentSegmentNames = mergeRecentSegmentNames(
			session.recentSegmentNames,
			[filename],
			Math.max(session.maxRetainedSegments, session.recentSegmentNames.length || 1)
		);

		this.upsertAssetMetadata(session, {
			filename,
			storageKey,
			assetKind: "segment",
			contentType,
			byteSize: body.length,
		});

		await this.touchSession(session);
		await session.save();
	}

	async heartbeat(session) {
		await this.touchSession(session);
		await session.save();
		return session;
	}

	async endSession(session) {
		await this.ensureSessionIsActive(session, "end_session");

		const now = new Date();
		session.status = "ended";
		session.endedAt = now;
		session.expiresAt = now;
		session.cleanupAfterAt = new Date(now.getTime() + this.config.endedSessionRetentionMs);
		await session.save();

		logger.info(`[live] session ended sessionId=${session.sessionId}`);

		return session;
	}

	async getShareSummary(publicToken) {
		const session = await StreamSessionModel.findOne({ publicToken });
		if (!session) {
			throw new LiveServiceError(404, "Live session not found.", "live_session_not_found");
		}

		if (session.status === "active" && session.expiresAt <= new Date()) {
			await this.markSessionExpired(session, "share_lookup_timeout");
		}

		return session;
	}

	async getPublicAsset(publicToken, rawFilename, expectedAssetKind = null) {
		let filename;
		try {
			filename = sanitizeUploadedFilename(rawFilename);
		} catch (err) {
			throw new LiveServiceError(400, err?.message || "Invalid live asset filename.", "invalid_live_asset_filename");
		}
		const session = await StreamSessionModel.findOne({ publicToken });
		await this.ensureSessionIsActive(session, "public_asset_lookup");

		const asset = session.assets.find((candidate) => candidate.filename === filename && (!expectedAssetKind || candidate.assetKind === expectedAssetKind));
		if (!asset) {
			throw new LiveServiceError(404, "Live asset not found.", "live_asset_not_found");
		}

		try {
			const storedObject = await this.storage.readObject(asset.storageKey);

			void StreamSessionModel.updateOne(
				{ sessionId: session.sessionId, "assets.filename": asset.filename },
				{ $set: { "assets.$.lastServedAt": new Date() } }
			).catch((err) => {
				logger.error(`Failed to update live asset serve time: ${err.message}`);
			});

			return {
				session,
				asset,
				...storedObject,
			};
		} catch (err) {
			throw new LiveServiceError(404, "Live asset storage object not found.", "live_storage_object_not_found");
		}
	}

	async runCleanup() {
		const now = new Date();
		const expiredSessions = await StreamSessionModel.find({
			status: "active",
			expiresAt: { $lte: now },
		});

		for (const session of expiredSessions) {
			await this.markSessionExpired(session, "cleanup_pass");
		}

		const staleSessions = await StreamSessionModel.find({
			status: { $in: ["ended", "expired"] },
			cleanupAfterAt: { $lte: now },
		});

		for (const session of staleSessions) {
			await this.storage.deletePrefix(session.storagePrefix);
			await StreamSessionModel.deleteOne({ _id: session._id });
			logger.info(`[live] session deleted sessionId=${session.sessionId} status=${session.status}`);
		}
	}
}

export { LiveService, LiveServiceError };
