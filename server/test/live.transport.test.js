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
	it("defaults missing transport config to HLS while preserving legacy fields", () => {
		const service = new LiveService(createConfig());
		const response = service.createSessionResponse(createSession(), "ingest-secret", "https://example.test");

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

	it("advertises hybrid and WebRTC modes as unavailable until LiveKit tokens are wired", () => {
		for (const mode of ["hybrid", "webrtc"]) {
			const service = new LiveService(createConfig({ LIVE_TRANSPORT_DEFAULT: mode }));
			const response = service.createSessionResponse(createSession({ transportMode: mode }), "ingest-secret");

			expect(response.transport.mode).to.equal(mode);
			expect(response.transport.webrtc.available).to.equal(false);
			expect(response.transport.webrtc.reason).to.equal("livekit_token_layer_not_enabled");
			expect(response.ingest.webrtc).to.not.have.property("token");
			expect(response.playback.webrtc).to.not.have.property("token");
			expect(response.ingest.hls.available).to.equal(true);
			expect(response.playback.hls.available).to.equal(true);
		}
	});
});
