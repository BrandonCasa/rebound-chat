import path from "node:path";

import logger from "../logger.js";

const transportDefaults = new Set(["hls", "webrtc", "hybrid"]);

const parsePositiveInt = (value, fallback) => {
	const parsed = Number.parseInt(value, 10);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const resolveStorageBackend = (value) => {
	return value === "s3" ? "s3" : "local";
};

const resolveLiveS3Bucket = (env = process.env) => env.S3_LIVE_BUCKET || env.LIVE_S3_BUCKET || "";

const resolveLiveTransportDefault = (value, { logger: warningLogger = logger } = {}) => {
	const normalized = String(value || "")
		.trim()
		.toLowerCase();

	if (!normalized) return "hls";
	if (transportDefaults.has(normalized)) return normalized;

	warningLogger?.warn?.(`[live] invalid LIVE_TRANSPORT_DEFAULT='${value}', falling back to hls`);
	return "hls";
};

const resolveCreateToken = (env = process.env) => {
	if (env.LIVE_INGEST_CREATE_TOKEN) return env.LIVE_INGEST_CREATE_TOKEN;
	if (env.NODE_ENV === "test") return "test-live-create-token";
	if (env.NODE_ENV === "development") return "dev-live-create-token";
	return "";
};

const createLiveConfig = (env = process.env, options = {}) =>
	Object.freeze({
		appEnv: env.APP_ENV || env.NODE_ENV || "development",
		awsRegion: env.AWS_REGION || env.LIVE_S3_REGION || "us-east-1",
		createToken: resolveCreateToken(env),
		transportDefault: resolveLiveTransportDefault(env.LIVE_TRANSPORT_DEFAULT, options),
		storageBackend: resolveStorageBackend(env.LIVE_STORAGE_BACKEND),
		storageDir: path.resolve(env.LIVE_STORAGE_DIR || "./live-storage"),
		sessionTtlMs: parsePositiveInt(env.LIVE_SESSION_TTL_MS, 90_000),
		cleanupIntervalMs: parsePositiveInt(env.LIVE_CLEANUP_INTERVAL_MS, 15_000),
		endedSessionRetentionMs: parsePositiveInt(env.LIVE_ENDED_RETENTION_MS, 30_000),
		heartbeatIntervalMs: parsePositiveInt(env.LIVE_HEARTBEAT_INTERVAL_MS, 15_000),
		maxRetainedSegments: parsePositiveInt(env.LIVE_MAX_RETAINED_SEGMENTS, 5),
		maxRetainedSegmentsCap: parsePositiveInt(env.LIVE_MAX_RETAINED_SEGMENTS_CAP, 10),
		maxPlaylistBytes: parsePositiveInt(env.LIVE_MAX_PLAYLIST_BYTES, 256 * 1024),
		maxSegmentBytes: parsePositiveInt(env.LIVE_MAX_SEGMENT_BYTES, 64 * 1024 * 1024),
		segmentCacheSeconds: parsePositiveInt(env.LIVE_SEGMENT_CACHE_SECONDS, 300),
		requireHttps: env.NODE_ENV === "production",
		s3Bucket: resolveLiveS3Bucket(env),
		s3Region: env.LIVE_S3_REGION || env.AWS_REGION || "us-east-1",
		s3Prefix: (env.LIVE_S3_PREFIX || "live").replace(/^\/+|\/+$/g, ""),
		s3Endpoint: env.LIVE_S3_ENDPOINT || "",
		s3ForcePathStyle: env.LIVE_S3_FORCE_PATH_STYLE === "true",
		liveKitUrl: env.LIVEKIT_URL || "",
		liveKitApiKey: env.LIVEKIT_API_KEY || "",
		liveKitApiSecret: env.LIVEKIT_API_SECRET || "",
		liveKitWebhookSecret: env.LIVEKIT_WEBHOOK_SECRET || "",
		s3LiveBucket: resolveLiveS3Bucket(env),
		s3MediaBucket: env.S3_MEDIA_BUCKET || "",
	});

const liveConfig = createLiveConfig();

export { createLiveConfig, liveConfig, resolveLiveTransportDefault };
