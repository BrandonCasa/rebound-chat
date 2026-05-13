import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { AccessToken } from "livekit-server-sdk";

import { expect, request, createBackend, stopBackend, resetUsers, registerUser, resetLiveSessions } from "./helpers/authTestUtils.js";

import { createLiveConfig } from "../src/live/config.js";
import { LiveService } from "../src/live/service.js";
import { buildLiveKitRoomName } from "../src/live/webrtc/sessionMapper.js";

const StreamSessionModel = (await import("../src/models/StreamSession.js")).default;
const liveRuntime = (await import("../src/live/runtime.js")).default;

const liveKitEnv = {
	NODE_ENV: "test",
	LIVE_STORAGE_DIR: process.env.LIVE_STORAGE_DIR,
	LIVE_TRANSPORT_DEFAULT: "hybrid",
	LIVEKIT_URL: "wss://livekit.example.test",
	LIVEKIT_API_KEY: "test-key",
	LIVEKIT_API_SECRET: "test-secret",
	LIVEKIT_ROOM_PREFIX: "rebound-live",
};

const createWebhookAuthorization = async (body) => {
	const accessToken = new AccessToken(liveKitEnv.LIVEKIT_API_KEY, liveKitEnv.LIVEKIT_API_SECRET);
	accessToken.sha256 = crypto.createHash("sha256").update(body).digest("base64");
	return accessToken.toJwt();
};

const createSession = async (agent, overrides = {}) => {
	const response = await agent
		.post("/live/api/session")
		.set("Authorization", `Bearer ${process.env.LIVE_INGEST_CREATE_TOKEN}`)
		.send({ label: "Deck stream", retainSegmentCount: 2, ...overrides });

	expect(response.status).to.equal(201);
	return response.body;
};

const uploadPlaylist = async (agent, sessionId, ingestSecret, filename, body) => {
	const response = await agent
		.put(`/live/api/${sessionId}/${filename}`)
		.set("x-live-ingest-secret", ingestSecret)
		.set("Content-Type", "application/vnd.apple.mpegurl")
		.send(body);

	expect(response.status).to.equal(204);
};

const uploadSegment = async (agent, sessionId, ingestSecret, filename, body) => {
	const response = await agent
		.put(`/live/api/${sessionId}/segments/${filename}`)
		.set("x-live-ingest-secret", ingestSecret)
		.set("Content-Type", "application/octet-stream")
		.send(body);

	expect(response.status).to.equal(204);
};

const authenticateViewer = async (agent) => {
	const { response, accessToken } = await registerUser(agent);
	expect(response.status).to.equal(200);
	return accessToken;
};

const getResponseText = (response) => {
	if (typeof response.text === "string") return response.text;
	if (Buffer.isBuffer(response.body)) return response.body.toString("utf8");
	return "";
};

describe("Live HLS relay routes", () => {
	let backend;

	before(async () => {
		backend = await createBackend();
	});

	after(async () => {
		await stopBackend();
	});

	beforeEach(async () => {
		await resetUsers();
		await resetLiveSessions();
	});

	it("rejects stream discovery and playback without a logged-in user", async () => {
		const agent = request.agent(backend.server);

		const streamListResponse = await agent.get("/live/api/streams");
		expect(streamListResponse.status).to.equal(401);

		const shareResponse = await agent.get("/live/api/share/not-a-real-token");
		expect(shareResponse.status).to.equal(401);

		const playlistResponse = await agent.get("/live/watch/not-a-real-token/master.m3u8");
		expect(playlistResponse.status).to.equal(401);

		const segmentResponse = await agent.get("/live/watch/not-a-real-token/segments/segment-000001.m4s");
		expect(segmentResponse.status).to.equal(401);

		agent.close();
	});

	it("creates a live session, ingests assets, and serves authenticated playback with HLS headers", async () => {
		const agent = request.agent(backend.server);
		const accessToken = await authenticateViewer(agent);
		const viewerAgent = request.agent(backend.server);
		const setViewerAuth = (requestBuilder) => requestBuilder.set("Authorization", `Bearer ${accessToken}`);

		const { sessionId, publicToken, ingestSecret, playbackUrl, shareUrl } = await createSession(agent, {
			label: "Patio camera",
			retainSegmentCount: 6,
		});

		expect(playbackUrl).to.match(new RegExp(`/live/watch/${publicToken}/master\\.m3u8$`));
		expect(shareUrl).to.match(new RegExp(`/live/share/${publicToken}$`));

		await uploadPlaylist(
			agent,
			sessionId,
			ingestSecret,
			"master.m3u8",
			[
				"#EXTM3U",
				"#EXT-X-VERSION:7",
				'#EXT-X-STREAM-INF:BANDWIDTH=18000000,CODECS="hvc1.1.6.L153.B0,mp4a.40.2",RESOLUTION=3840x2160',
				"source-video.m3u8",
				"",
			].join("\n")
		);

		await uploadSegment(agent, sessionId, ingestSecret, "init.mp4", Buffer.from("init-data"));
		await uploadSegment(agent, sessionId, ingestSecret, "segment-000001.m4s", Buffer.from("segment-one"));
		await uploadSegment(agent, sessionId, ingestSecret, "segment-000002.m4s", Buffer.from("segment-two"));

		await uploadPlaylist(
			agent,
			sessionId,
			ingestSecret,
			"video.m3u8",
			[
				"#EXTM3U",
				"#EXT-X-VERSION:7",
				"#EXT-X-TARGETDURATION:2",
				"#EXT-X-MEDIA-SEQUENCE:1",
				'#EXT-X-MAP:URI="init.mp4"',
				"#EXTINF:2.000,",
				"segment-000001.m4s",
				"#EXTINF:2.000,",
				"segment-000002.m4s",
				"",
			].join("\n")
		);

		const masterResponse = await setViewerAuth(viewerAgent.get(`/live/watch/${publicToken}/master.m3u8`));
		const masterText = getResponseText(masterResponse);
		expect(masterResponse.status).to.equal(200);
		expect(masterResponse.header["content-type"]).to.include("application/vnd.apple.mpegurl");
		expect(masterResponse.header["cache-control"]).to.include("no-store");
		expect(masterResponse.header.vary).to.include("Authorization");
		expect(masterText).to.include("video.m3u8");
		expect(masterText).to.not.include("source-video.m3u8");

		const videoResponse = await setViewerAuth(viewerAgent.get(`/live/watch/${publicToken}/video.m3u8`));
		const videoText = getResponseText(videoResponse);
		expect(videoResponse.status).to.equal(200);
		expect(videoResponse.header["cache-control"]).to.include("no-store");
		expect(videoText).to.include('URI="segments/init.mp4"');
		expect(videoText).to.include("segments/segment-000001.m4s");

		const segmentResponse = await setViewerAuth(viewerAgent.get(`/live/watch/${publicToken}/segments/segment-000001.m4s`));
		expect(segmentResponse.status).to.equal(200);
		expect(segmentResponse.header["content-type"]).to.include("video/iso.segment");
		expect(segmentResponse.header["cache-control"]).to.include("private");
		expect(segmentResponse.header["cache-control"]).to.include("immutable");
		expect(segmentResponse.header.vary).to.include("Authorization");
		expect(segmentResponse.header["content-length"]).to.equal(String(Buffer.byteLength("segment-one")));

		const shareResponse = await setViewerAuth(viewerAgent.get(`/live/api/share/${publicToken}`));
		expect(shareResponse.status).to.equal(200);
		expect(shareResponse.body.status).to.equal("active");
		expect(shareResponse.body.isPlayable).to.equal(true);
		expect(shareResponse.body.playbackUrl).to.match(new RegExp(`/live/watch/${publicToken}/master\\.m3u8$`));
		expect(shareResponse.body.mediaInfo.masterPlaylist.resolution).to.equal("3840x2160");
		expect(shareResponse.body.mediaInfo.mediaPlaylist.targetDuration).to.equal(2);

		viewerAgent.close();
		agent.close();
	});

	it("lets a logged-in account create one named live stream without a create token", async () => {
		const agent = request.agent(backend.server);
		const { response: registerResponse, accessToken } = await registerUser(agent, {
			username: "streamhost",
			displayName: "Stream Host",
		});
		expect(registerResponse.status).to.equal(200);

		const createResponse = await agent
			.post("/live/api/session")
			.set("Authorization", `Bearer ${accessToken}`)
			.send({ label: "Ignored custom title", retainSegmentCount: 3 });

		expect(createResponse.status).to.equal(201);
		const session = await StreamSessionModel.findOne({ sessionId: createResponse.body.sessionId });
		expect(session.label).to.equal("Stream Host");
		expect(session.createdByUsername).to.equal("Stream Host");
		expect(session.createdByUser.toString()).to.equal(registerResponse.body.user.id);

		const secondCreateResponse = await agent.post("/live/api/session").set("Authorization", `Bearer ${accessToken}`).send({ label: "Second stream" });

		expect(secondCreateResponse.status).to.equal(409);
		expect(secondCreateResponse.body.code).to.equal("account_live_stream_limit");

		const endResponse = await agent.post(`/live/api/${createResponse.body.sessionId}/end`).set("x-live-ingest-secret", createResponse.body.ingestSecret);
		expect(endResponse.status).to.equal(200);

		const createAfterEndResponse = await agent.post("/live/api/session").set("Authorization", `Bearer ${accessToken}`).send({});
		expect(createAfterEndResponse.status).to.equal(201);

		agent.close();
	});

	it("lists available streams with current ingest metadata", async () => {
		const agent = request.agent(backend.server);
		await authenticateViewer(agent);

		const playableSession = await createSession(agent, {
			label: "Main deck",
			retainSegmentCount: 4,
		});
		const pendingSession = await createSession(agent, {
			label: "Waiting room",
			retainSegmentCount: 2,
		});

		await uploadPlaylist(
			agent,
			playableSession.sessionId,
			playableSession.ingestSecret,
			"master.m3u8",
			[
				"#EXTM3U",
				"#EXT-X-VERSION:7",
				'#EXT-X-STREAM-INF:BANDWIDTH=9000000,CODECS="avc1.640028,mp4a.40.2",RESOLUTION=1920x1080,FRAME-RATE=60',
				"video.m3u8",
				"",
			].join("\n")
		);
		await uploadSegment(agent, playableSession.sessionId, playableSession.ingestSecret, "segment-000001.m4s", Buffer.from("segment-one"));
		await uploadSegment(agent, playableSession.sessionId, playableSession.ingestSecret, "segment-000002.m4s", Buffer.from("segment-two"));
		await uploadPlaylist(
			agent,
			playableSession.sessionId,
			playableSession.ingestSecret,
			"video.m3u8",
			[
				"#EXTM3U",
				"#EXT-X-VERSION:7",
				"#EXT-X-TARGETDURATION:2",
				"#EXT-X-MEDIA-SEQUENCE:1",
				"#EXT-X-INDEPENDENT-SEGMENTS",
				"#EXTINF:2.000,",
				"segment-000001.m4s",
				"#EXTINF:2.000,",
				"segment-000002.m4s",
				"",
			].join("\n")
		);

		const listResponse = await agent.get("/live/api/streams");
		expect(listResponse.status).to.equal(200);
		expect(listResponse.body.streams).to.have.length(2);

		const playableStream = listResponse.body.streams.find((stream) => stream.sessionId === playableSession.sessionId);
		const pendingStream = listResponse.body.streams.find((stream) => stream.sessionId === pendingSession.sessionId);

		expect(playableStream.isPlayable).to.equal(true);
		expect(playableStream.mediaInfo.masterPlaylist.resolution).to.equal("1920x1080");
		expect(playableStream.mediaInfo.masterPlaylist.frameRate).to.equal(60);
		expect(playableStream.mediaInfo.mediaPlaylist.segmentCount).to.equal(2);
		expect(playableStream.mediaInfo.latestSegment.filename).to.equal("segment-000002.m4s");
		expect(pendingStream.isPlayable).to.equal(false);

		agent.close();
	});

	it("accepts live ingest requests from non-allowlisted origins", async () => {
		const agent = request.agent(backend.server);
		const origin = "https://uploader.example";
		const createResponse = await agent
			.post("/live/api/session")
			.set("Origin", origin)
			.set("Authorization", `Bearer ${process.env.LIVE_INGEST_CREATE_TOKEN}`)
			.send({ label: "Remote uploader" });

		expect(createResponse.status).to.equal(201);
		expect(createResponse.header["access-control-allow-origin"]).to.equal(origin);

		const { sessionId, ingestSecret } = createResponse.body;
		const segmentResponse = await agent
			.put(`/live/api/${sessionId}/segments/init.mp4`)
			.set("Origin", origin)
			.set("x-live-ingest-secret", ingestSecret)
			.set("Content-Type", "video/mp4")
			.send(Buffer.from("init-data"));

		expect(segmentResponse.status).to.equal(204);
		expect(segmentResponse.header["access-control-allow-origin"]).to.equal(origin);

		agent.close();
	});

	it("accepts signed LiveKit webhook callbacks as raw bodies", async () => {
		const originalConfig = liveRuntime.config;
		const originalService = liveRuntime.service;
		const config = createLiveConfig(liveKitEnv, { logger: { warn() {} } });
		liveRuntime.config = config;
		liveRuntime.service = new LiveService(config);

		const agent = request.agent(backend.server);
		try {
			const { sessionId } = await createSession(agent, { label: "WebRTC room" });
			const roomName = buildLiveKitRoomName(sessionId, { roomPrefix: liveKitEnv.LIVEKIT_ROOM_PREFIX });
			const payload = JSON.stringify({
				event: "room_started",
				room: {
					name: roomName,
				},
			});
			const authorization = await createWebhookAuthorization(payload);

			const webhookResponse = await agent
				.post("/live/api/webhooks/livekit")
				.set("Authorization", authorization)
				.set("Content-Type", "application/webhook+json")
				.send(payload);

			expect(webhookResponse.status).to.equal(202);
			expect(webhookResponse.body).to.include({
				received: true,
				verified: true,
				event: "room_started",
				roomName,
				sessionId,
				handled: true,
				sessionFound: true,
			});
		} finally {
			liveRuntime.config = originalConfig;
			liveRuntime.service = originalService;
			agent.close();
		}
	});

	it("keeps only a rolling segment window from the latest media playlist", async () => {
		const agent = request.agent(backend.server);
		await authenticateViewer(agent);

		const { sessionId, publicToken, ingestSecret } = await createSession(agent, { retainSegmentCount: 2 });

		await uploadSegment(agent, sessionId, ingestSecret, "segment-a.ts", Buffer.from("aaa"));
		await uploadSegment(agent, sessionId, ingestSecret, "segment-b.ts", Buffer.from("bbb"));

		await uploadPlaylist(
			agent,
			sessionId,
			ingestSecret,
			"video.m3u8",
			["#EXTM3U", "#EXT-X-TARGETDURATION:2", "#EXT-X-MEDIA-SEQUENCE:1", "#EXTINF:2.000,", "segment-a.ts", "#EXTINF:2.000,", "segment-b.ts", ""].join("\n")
		);

		await uploadSegment(agent, sessionId, ingestSecret, "segment-c.ts", Buffer.from("ccc"));
		await uploadPlaylist(
			agent,
			sessionId,
			ingestSecret,
			"video.m3u8",
			["#EXTM3U", "#EXT-X-TARGETDURATION:2", "#EXT-X-MEDIA-SEQUENCE:2", "#EXTINF:2.000,", "segment-b.ts", "#EXTINF:2.000,", "segment-c.ts", ""].join("\n")
		);

		const staleSegmentResponse = await agent.get(`/live/watch/${publicToken}/segments/segment-a.ts`);
		expect(staleSegmentResponse.status).to.equal(404);

		const currentSegmentResponse = await agent.get(`/live/watch/${publicToken}/segments/segment-c.ts`);
		expect(currentSegmentResponse.status).to.equal(200);
		expect(currentSegmentResponse.header["content-type"]).to.include("video/mp2t");

		agent.close();
	});

	it("ends a session and revokes further public playback", async () => {
		const agent = request.agent(backend.server);
		await authenticateViewer(agent);

		const { sessionId, publicToken, ingestSecret } = await createSession(agent);

		const endResponse = await agent.post(`/live/api/${sessionId}/end`).set("x-live-ingest-secret", ingestSecret);
		expect(endResponse.status).to.equal(200);
		expect(endResponse.body.status).to.equal("ended");

		const shareResponse = await agent.get(`/live/api/share/${publicToken}`);
		expect(shareResponse.status).to.equal(200);
		expect(shareResponse.body.status).to.equal("ended");
		expect(shareResponse.body.isPlayable).to.equal(false);

		const playbackResponse = await agent.get(`/live/watch/${publicToken}/master.m3u8`);
		expect(playbackResponse.status).to.equal(410);

		agent.close();
	});

	it("cleans expired sessions and removes stored files", async () => {
		const agent = request.agent(backend.server);
		const { sessionId, ingestSecret } = await createSession(agent);

		await uploadSegment(agent, sessionId, ingestSecret, "segment-z.ts", Buffer.from("zzz"));

		const session = await StreamSessionModel.findOne({ sessionId });
		expect(session).to.exist;

		session.status = "expired";
		session.expiresAt = new Date(Date.now() - 60_000);
		session.cleanupAfterAt = new Date(Date.now() - 60_000);
		await session.save();

		const storagePath = path.resolve(process.env.LIVE_STORAGE_DIR, "sessions", sessionId);
		await liveRuntime.service.runCleanup();

		const cleanedSession = await StreamSessionModel.findOne({ sessionId });
		expect(cleanedSession).to.equal(null);

		let storageExists = true;
		try {
			await fs.access(storagePath);
		} catch (_err) {
			storageExists = false;
		}

		expect(storageExists).to.equal(false);

		agent.close();
	});
});
