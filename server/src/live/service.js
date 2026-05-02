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

	createSessionResponse(session, ingestSecret, origin = "") {
		return {
			sessionId: session.sessionId,
			publicToken: session.publicToken,
			ingestSecret,
			status: session.status,
			heartbeatIntervalMs: this.config.heartbeatIntervalMs,
			expiresAt: session.expiresAt,
			playbackUrl: origin ? `${origin}${session.playbackPath}` : session.playbackPath,
			shareUrl: origin ? `${origin}${session.sharePath}` : session.sharePath,
		};
	}

	createShareSummary(session, origin = "") {
		const hasMasterPlaylist = session.assets.some((asset) => asset.filename === "master.m3u8" && asset.assetKind === "master");
		const hasMediaPlaylist = session.assets.some((asset) => asset.filename === "video.m3u8" && asset.assetKind === "media-playlist");

		return {
			sessionId: session.sessionId,
			label: session.label,
			status: session.status,
			createdAt: session.createdAt,
			lastHeartbeatAt: session.lastHeartbeatAt,
			expiresAt: session.expiresAt,
			endedAt: session.endedAt,
			playbackUrl: origin ? `${origin}${session.playbackPath}` : session.playbackPath,
			shareUrl: origin ? `${origin}${session.sharePath}` : session.sharePath,
			recentSegmentCount: session.recentSegmentNames.length,
			hasMasterPlaylist,
			hasMediaPlaylist,
			isPlayable: session.status === "active" && hasMasterPlaylist && hasMediaPlaylist,
		};
	}

	async createSession({ label = "", createdByIp = "", requestedRetainedSegments = null } = {}) {
		const now = new Date();
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
			label: String(label || "")
				.trim()
				.slice(0, 120),
			publicToken,
			ingestSecretHash: hashSecret(ingestSecret),
			createdByIp,
			lastHeartbeatAt: now,
			expiresAt,
			cleanupAfterAt,
			status: "active",
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
		let body;
		if (Buffer.isBuffer(rawBody)) {
			body = rawBody;
		} else if (typeof rawBody === "string") {
			body = Buffer.from(rawBody, "utf8");
		} else {
			throw new LiveServiceError(422, "Segment body must be binary data.", "invalid_segment_body_type");
		}
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
