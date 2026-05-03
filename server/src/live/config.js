import path from "node:path";

const parsePositiveInt = (value, fallback) => {
	const parsed = Number.parseInt(value, 10);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const resolveStorageBackend = (value) => {
	return value === "s3" ? "s3" : "local";
};

const resolveCreateToken = () => {
	if (process.env.LIVE_INGEST_CREATE_TOKEN) return process.env.LIVE_INGEST_CREATE_TOKEN;
	if (process.env.NODE_ENV === "test") return "test-live-create-token";
	if (process.env.NODE_ENV === "development") return "dev-live-create-token";
	return "";
};

const liveConfig = Object.freeze({
	createToken: resolveCreateToken(),
	storageBackend: resolveStorageBackend(process.env.LIVE_STORAGE_BACKEND),
	storageDir: path.resolve(process.env.LIVE_STORAGE_DIR || "./live-storage"),
	sessionTtlMs: parsePositiveInt(process.env.LIVE_SESSION_TTL_MS, 90_000),
	cleanupIntervalMs: parsePositiveInt(process.env.LIVE_CLEANUP_INTERVAL_MS, 15_000),
	endedSessionRetentionMs: parsePositiveInt(process.env.LIVE_ENDED_RETENTION_MS, 30_000),
	heartbeatIntervalMs: parsePositiveInt(process.env.LIVE_HEARTBEAT_INTERVAL_MS, 15_000),
	maxRetainedSegments: parsePositiveInt(process.env.LIVE_MAX_RETAINED_SEGMENTS, 5),
	maxRetainedSegmentsCap: parsePositiveInt(process.env.LIVE_MAX_RETAINED_SEGMENTS_CAP, 10),
	maxPlaylistBytes: parsePositiveInt(process.env.LIVE_MAX_PLAYLIST_BYTES, 256 * 1024),
	maxSegmentBytes: parsePositiveInt(process.env.LIVE_MAX_SEGMENT_BYTES, 64 * 1024 * 1024),
	segmentCacheSeconds: parsePositiveInt(process.env.LIVE_SEGMENT_CACHE_SECONDS, 300),
	requireHttps: process.env.NODE_ENV === "production",
	s3Bucket: process.env.LIVE_S3_BUCKET || "",
	s3Region: process.env.LIVE_S3_REGION || "us-east-1",
	s3Prefix: (process.env.LIVE_S3_PREFIX || "live").replace(/^\/+|\/+$/g, ""),
	s3Endpoint: process.env.LIVE_S3_ENDPOINT || "",
	s3ForcePathStyle: process.env.LIVE_S3_FORCE_PATH_STYLE === "true",
});

export { liveConfig };
