import fs from "node:fs/promises";
import path from "node:path";

import { expect, request, createBackend, stopBackend, resetLiveSessions } from "./helpers/authTestUtils.js";

const StreamSessionModel = (await import("../src/models/StreamSession.js")).default;
const liveRuntime = (await import("../src/live/runtime.js")).default;

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
		await resetLiveSessions();
	});

	it("creates a live session, ingests assets, and serves public playback with HLS headers", async () => {
		const agent = request.agent(backend.server);
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

		const masterResponse = await agent.get(`/live/watch/${publicToken}/master.m3u8`);
		const masterText = getResponseText(masterResponse);
		expect(masterResponse.status).to.equal(200);
		expect(masterResponse.header["content-type"]).to.include("application/vnd.apple.mpegurl");
		expect(masterResponse.header["cache-control"]).to.include("no-store");
		expect(masterText).to.include("video.m3u8");
		expect(masterText).to.not.include("source-video.m3u8");

		const videoResponse = await agent.get(`/live/watch/${publicToken}/video.m3u8`);
		const videoText = getResponseText(videoResponse);
		expect(videoResponse.status).to.equal(200);
		expect(videoResponse.header["cache-control"]).to.include("no-store");
		expect(videoText).to.include('URI="segments/init.mp4"');
		expect(videoText).to.include("segments/segment-000001.m4s");

		const segmentResponse = await agent.get(`/live/watch/${publicToken}/segments/segment-000001.m4s`);
		expect(segmentResponse.status).to.equal(200);
		expect(segmentResponse.header["content-type"]).to.include("video/iso.segment");
		expect(segmentResponse.header["cache-control"]).to.include("immutable");
		expect(segmentResponse.header["content-length"]).to.equal(String(Buffer.byteLength("segment-one")));

		const shareResponse = await agent.get(`/live/api/share/${publicToken}`);
		expect(shareResponse.status).to.equal(200);
		expect(shareResponse.body.status).to.equal("active");
		expect(shareResponse.body.isPlayable).to.equal(true);
		expect(shareResponse.body.playbackUrl).to.match(new RegExp(`/live/watch/${publicToken}/master\\.m3u8$`));

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

	it("keeps only a rolling segment window from the latest media playlist", async () => {
		const agent = request.agent(backend.server);
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
