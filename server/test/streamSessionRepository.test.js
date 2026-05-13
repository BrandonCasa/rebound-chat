import { expect } from "chai";

import { MongoStreamSessionRepository, mapStreamSessionToRecord, normalizeTransportMode } from "../src/data/streamSessionRepository.js";

const createSessionDocument = (overrides = {}) => ({
	_id: { toString: () => "mongo-id" },
	sessionId: "session-123",
	label: "Deck stream",
	publicToken: "public-token",
	ingestSecretHash: "secret-hash",
	createdByIp: "127.0.0.1",
	createdByUser: { toString: () => "user-id" },
	createdByUsername: "streamer",
	status: "active",
	transportMode: "hybrid",
	playbackPath: "/live/watch/public-token/master.m3u8",
	sharePath: "/live/share/public-token",
	storageBackend: "local",
	storagePrefix: "sessions/session-123",
	maxRetainedSegments: 5,
	recentSegmentNames: ["segment-000001.m4s"],
	lastHeartbeatAt: new Date("2026-01-01T00:00:00.000Z"),
	expiresAt: new Date("2026-01-01T00:01:00.000Z"),
	cleanupAfterAt: new Date("2026-01-01T00:02:00.000Z"),
	assets: [
		{
			filename: "master.m3u8",
			storageKey: "sessions/session-123/master.m3u8",
			assetKind: "master",
			contentType: "application/vnd.apple.mpegurl",
			byteSize: 128,
		},
	],
	...overrides,
});

describe("stream session repository boundary", () => {
	it("normalizes unknown transport modes to HLS", () => {
		expect(normalizeTransportMode("webrtc")).to.equal("webrtc");
		expect(normalizeTransportMode("HYBRID")).to.equal("hybrid");
		expect(normalizeTransportMode("bad-value")).to.equal("hls");
	});

	it("maps current Mongo stream sessions into a transport-aware record", () => {
		const record = mapStreamSessionToRecord(createSessionDocument());

		expect(record.id).to.equal("mongo-id");
		expect(record.sessionId).to.equal("session-123");
		expect(record.transport.mode).to.equal("hybrid");
		expect(record.transport.hls.playbackPath).to.equal("/live/watch/public-token/master.m3u8");
		expect(record.transport.hls.sharePath).to.equal("/live/share/public-token");
		expect(record.transport.webrtc.available).to.equal(false);
		expect(record.transport.webrtc.reason).to.equal("livekit_token_layer_not_enabled");
		expect(record.assets).to.have.length(1);
		expect(record.assets[0].assetKind).to.equal("master");
	});

	it("wraps Mongo reads without requiring PostgreSQL", async () => {
		const model = {
			async findOne(query) {
				return createSessionDocument({ sessionId: query.sessionId });
			},
		};
		const repository = new MongoStreamSessionRepository({ model });

		const record = await repository.findBySessionId("session-abc");

		expect(record.sessionId).to.equal("session-abc");
		expect(record.transport.mode).to.equal("hybrid");
	});
});
