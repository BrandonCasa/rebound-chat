import express, { Router } from "express";
import rateLimit from "express-rate-limit";

import logger from "../logger.js";
import liveRuntime from "../live/runtime.js";
import { PLAYLIST_CONTENT_TYPE } from "../live/mime.js";
import { LiveServiceError } from "../live/service.js";
import { getBearerToken } from "../utils/auth.js";

const router = Router();

const createLimiter = rateLimit({
	windowMs: 5 * 60 * 1000,
	max: 20,
	standardHeaders: true,
	legacyHeaders: false,
	message: { error: "Too many live session requests, please try again later." },
});

const ingestLimiter = rateLimit({
	windowMs: 60 * 1000,
	max: 1_200,
	standardHeaders: true,
	legacyHeaders: false,
	message: { error: "Too many live ingest requests, please try again later." },
});

const playbackLimiter = rateLimit({
	windowMs: 60 * 1000,
	max: 600,
	standardHeaders: true,
	legacyHeaders: false,
	message: { error: "Too many live playback requests, please try again later." },
});

const playlistParser = express.text({
	type: () => true,
	limit: liveRuntime.config.maxPlaylistBytes,
});

const rawSegmentParser = express.raw({
	type: () => true,
	limit: liveRuntime.config.maxSegmentBytes,
});

const jsonParser = express.json({ limit: "32kb" });

const isHttpsRequest = (req) => {
	const forwardedProto = req.get("x-forwarded-proto");
	const protocol = (forwardedProto || req.protocol || "").split(",")[0].trim();
	return protocol === "https";
};

const getRequestOrigin = (req) => liveRuntime.service.buildOrigin(req);

const sendLiveError = (res, err) => {
	if (err instanceof LiveServiceError) {
		return res.status(err.status).json({ error: err.message, code: err.code });
	}

	logger.error(`Unhandled live route error: ${err.message}`);
	return res.status(500).json({ error: "Live route error." });
};

const getIngestSecret = (req) => {
	const headerSecret = req.get("x-live-ingest-secret");
	if (headerSecret) return headerSecret;
	return getBearerToken(req.get("authorization"));
};

router.use((req, res, next) => {
	if (!liveRuntime.config.requireHttps || isHttpsRequest(req)) {
		return next();
	}

	return res.status(426).json({ error: "HTTPS is required for live ingest and playback." });
});

router.use((req, res, next) => {
	const startedAt = Date.now();

	res.on("finish", () => {
		logger.info(`[live] ${req.method} ${req.originalUrl} status=${res.statusCode} durationMs=${Date.now() - startedAt} ip=${req.ip}`);
	});

	next();
});

const requireCreateToken = (req, res, next) => {
	const requestToken = getBearerToken(req.get("authorization")) || req.get("x-live-create-token");
	const expectedToken = liveRuntime.config.createToken;

	if (!expectedToken) {
		return res.status(503).json({ error: "Live ingest create token is not configured." });
	}

	if (!requestToken || requestToken !== expectedToken) {
		return res.status(401).json({ error: "Invalid live ingest create token." });
	}

	return next();
};

const requireIngestSession = async (req, res, next) => {
	try {
		req.liveSession = await liveRuntime.service.authenticateIngestSession(req.params.sessionId, getIngestSecret(req));
		return next();
	} catch (err) {
		return sendLiveError(res, err);
	}
};

const sendPlaylistResponse = (res, storedAsset) => {
	res.setHeader("Content-Type", PLAYLIST_CONTENT_TYPE);
	res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
	res.setHeader("Pragma", "no-cache");
	res.setHeader("Expires", "0");
	res.setHeader("Content-Length", String(storedAsset.size));
	res.setHeader("Last-Modified", new Date(storedAsset.lastModified).toUTCString());
	res.setHeader("X-Content-Type-Options", "nosniff");
	return res.send(storedAsset.body);
};

const sendSegmentResponse = (res, storedAsset) => {
	res.setHeader("Content-Type", storedAsset.asset.contentType);
	res.setHeader("Cache-Control", `public, max-age=${liveRuntime.config.segmentCacheSeconds}, immutable`);
	res.setHeader("Content-Length", String(storedAsset.size));
	res.setHeader("Last-Modified", new Date(storedAsset.lastModified).toUTCString());
	res.setHeader("Accept-Ranges", "bytes");
	res.setHeader("X-Content-Type-Options", "nosniff");
	return res.send(storedAsset.body);
};

router.post("/api/session", createLimiter, requireCreateToken, jsonParser, async (req, res) => {
	try {
		const { session, ingestSecret } = await liveRuntime.service.createSession({
			label: req.body?.label,
			createdByIp: req.ip,
			requestedRetainedSegments: req.body?.retainSegmentCount,
		});

		return res.status(201).json(liveRuntime.service.createSessionResponse(session, ingestSecret, getRequestOrigin(req)));
	} catch (err) {
		return sendLiveError(res, err);
	}
});

router.put("/api/:sessionId/master.m3u8", ingestLimiter, requireIngestSession, playlistParser, async (req, res) => {
	try {
		await liveRuntime.service.uploadMasterPlaylist(req.liveSession, req.body);
		return res.sendStatus(204);
	} catch (err) {
		return sendLiveError(res, err);
	}
});

router.put("/api/:sessionId/video.m3u8", ingestLimiter, requireIngestSession, playlistParser, async (req, res) => {
	try {
		await liveRuntime.service.uploadMediaPlaylist(req.liveSession, req.body);
		return res.sendStatus(204);
	} catch (err) {
		return sendLiveError(res, err);
	}
});

router.put("/api/:sessionId/segments/:filename", ingestLimiter, requireIngestSession, rawSegmentParser, async (req, res) => {
	try {
		await liveRuntime.service.uploadSegment(req.liveSession, req.params.filename, req.body);
		return res.sendStatus(204);
	} catch (err) {
		return sendLiveError(res, err);
	}
});

router.post("/api/:sessionId/heartbeat", ingestLimiter, requireIngestSession, async (req, res) => {
	try {
		const session = await liveRuntime.service.heartbeat(req.liveSession);
		return res.json({
			sessionId: session.sessionId,
			status: session.status,
			expiresAt: session.expiresAt,
		});
	} catch (err) {
		return sendLiveError(res, err);
	}
});

router.post("/api/:sessionId/end", ingestLimiter, requireIngestSession, async (req, res) => {
	try {
		const session = await liveRuntime.service.endSession(req.liveSession);
		return res.json({
			sessionId: session.sessionId,
			status: session.status,
			endedAt: session.endedAt,
		});
	} catch (err) {
		return sendLiveError(res, err);
	}
});

router.get("/api/share/:publicToken", playbackLimiter, async (req, res) => {
	try {
		const session = await liveRuntime.service.getShareSummary(req.params.publicToken);
		res.setHeader("Cache-Control", "no-store");
		return res.json(liveRuntime.service.createShareSummary(session, getRequestOrigin(req)));
	} catch (err) {
		return sendLiveError(res, err);
	}
});

router.get("/watch/:publicToken/master.m3u8", playbackLimiter, async (req, res) => {
	try {
		const storedAsset = await liveRuntime.service.getPublicAsset(req.params.publicToken, "master.m3u8", "master");
		return sendPlaylistResponse(res, storedAsset);
	} catch (err) {
		return sendLiveError(res, err);
	}
});

router.get("/watch/:publicToken/video.m3u8", playbackLimiter, async (req, res) => {
	try {
		const storedAsset = await liveRuntime.service.getPublicAsset(req.params.publicToken, "video.m3u8", "media-playlist");
		return sendPlaylistResponse(res, storedAsset);
	} catch (err) {
		return sendLiveError(res, err);
	}
});

router.get("/watch/:publicToken/segments/:filename", playbackLimiter, async (req, res) => {
	try {
		const storedAsset = await liveRuntime.service.getPublicAsset(req.params.publicToken, req.params.filename, "segment");
		return sendSegmentResponse(res, storedAsset);
	} catch (err) {
		return sendLiveError(res, err);
	}
});

export default router;
