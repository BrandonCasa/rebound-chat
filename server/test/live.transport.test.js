import { expect } from "chai";

import { createLiveConfig, resolveLiveTransportDefault } from "../src/live/config.js";
import { LiveService } from "../src/live/service.js";

const createSession = (overrides = {}) => ({
	sessionId: "session-123",
	publicToken: "public-token",
	status: "active",
	expiresAt: new Date("2026-01-01T00:01:00.000Z"),
	playbackPath: "/live/watch/public-token/master.m3u8",
	sharePath: "/live/share/public-token",
	storagePrefix: "sessions/session-123",
	...overrides,
});

const createConfig = (overrides = {}) =>
	createLiveConfig(
		{
			NODE_ENV: "test",
			LIVE_STORAGE_DIR: "./test-live-storage",
			...overrides,
		},
		{ logger: { warn() {} } }
	);

describe("live transport-aware session responses", () => {
	it("defaults missing transport config to HLS while preserving legacy fields", async () => {
		const service = new LiveService(createConfig());
		const response = await service.createSessionResponse(createSession(), "ingest-secret", "https://example.test");

		expect(response.sessionId).to.equal("session-123");
		expect(response.ingestSecret).to.equal("ingest-secret");
		expect(response.playbackUrl).to.equal("https://example.test/live/watch/public-token/master.m3u8");
		expect(response.shareUrl).to.equal("https://example.test/live/share/public-token");
		expect(response.transport.mode).to.equal("hls");
		expect(response.ingest.hls.available).to.equal(true);
		expect(response.playback.hls.available).to.equal(true);
		expect(response.ingest.webrtc.available).to.equal(false);
		expect(response.ingest.webrtc.reason).to.equal("hls_default");
		expect(response.ingest.webrtc).to.not.have.property("token");
	});

	it("falls back invalid transport config to HLS with a warning", () => {
		const warnings = [];
		const transport = resolveLiveTransportDefault("rtmp", {
			logger: {
				warn(message) {
					warnings.push(message);
				},
			},
		});

		expect(transport).to.equal("hls");
		expect(warnings).to.have.length(1);
		expect(warnings[0]).to.include("invalid LIVE_TRANSPORT_DEFAULT");
	});

	it("fails gracefully when WebRTC is requested without LiveKit config", async () => {
		for (const mode of ["hybrid", "webrtc"]) {
			const service = new LiveService(createConfig({ LIVE_TRANSPORT_DEFAULT: mode }));
			const response = await service.createSessionResponse(createSession({ transportMode: mode }), "ingest-secret");

			expect(response.transport.mode).to.equal(mode);
			expect(response.transport.webrtc.available).to.equal(false);
			expect(response.transport.webrtc.reason).to.equal("missing_livekit_config");
			expect(response.transport.webrtc.missingConfig).to.deep.equal(["LIVEKIT_URL", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET"]);
			expect(response.ingest.webrtc).to.not.have.property("token");
			expect(response.playback.webrtc).to.not.have.property("token");
			expect(response.ingest.hls.available).to.equal(true);
			expect(response.playback.hls.available).to.equal(true);
		}
	});

	it("advertises WebRTC tokens only when LiveKit config is valid", async () => {
		const service = new LiveService(
			createConfig({
				LIVE_TRANSPORT_DEFAULT: "hybrid",
				LIVEKIT_URL: "wss://livekit.example.test",
				LIVEKIT_API_KEY: "test-key",
				LIVEKIT_API_SECRET: "test-secret",
				LIVEKIT_TOKEN_TTL_SECONDS: "300",
			})
		);
		const response = await service.createSessionResponse(createSession({ transportMode: "hybrid" }), "ingest-secret");

		expect(response.transport.mode).to.equal("hybrid");
		expect(response.transport.webrtc.available).to.equal(true);
		expect(response.transport.webrtc.roomName).to.equal("rebound-live-session-123");
		expect(response.ingest.hls.available).to.equal(true);
		expect(response.playback.hls.available).to.equal(true);
		expect(response.ingest.webrtc.available).to.equal(true);
		expect(response.ingest.webrtc.role).to.equal("publisher");
		expect(response.ingest.webrtc.token).to.be.a("string");
		expect(response.playback.webrtc.available).to.equal(true);
		expect(response.playback.webrtc.role).to.equal("viewer");
		expect(response.playback.webrtc.token).to.be.a("string");
	});
});
