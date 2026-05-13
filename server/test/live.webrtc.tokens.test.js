import { expect } from "chai";

import { createWebrtcConfig, getMissingLiveKitTokenConfig } from "../src/live/webrtc/config.js";
import { buildLiveKitRoomName } from "../src/live/webrtc/sessionMapper.js";
import { createPublisherTokenIntent, createViewerTokenIntent } from "../src/live/webrtc/tokens.js";

const config = createWebrtcConfig({
	LIVEKIT_URL: "wss://livekit.example.test",
	LIVEKIT_API_KEY: "test-key",
	LIVEKIT_API_SECRET: "test-secret",
	LIVEKIT_ROOM_PREFIX: "rebound-live",
	LIVEKIT_TOKEN_TTL_SECONDS: "300",
});

describe("LiveKit token intent stubs", () => {
	it("imports without requiring LiveKit environment variables", () => {
		expect(getMissingLiveKitTokenConfig(createWebrtcConfig({}))).to.deep.equal(["LIVEKIT_URL", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET"]);
	});

	it("locks room naming to one stream session", () => {
		expect(buildLiveKitRoomName("session_123")).to.equal("rebound-live-session_123");
		expect(buildLiveKitRoomName("session 123", { roomPrefix: "custom prefix" })).to.equal("custom-prefix-session-123");
	});

	it("scopes publisher intent to one room with publishing permissions", () => {
		const intent = createPublisherTokenIntent({
			sessionId: "session_123",
			identity: "user-1",
			name: "Publisher",
			config,
			now: new Date("2026-01-01T00:00:00.000Z"),
		});

		expect(intent.roomName).to.equal("rebound-live-session_123");
		expect(intent.ttlSeconds).to.equal(300);
		expect(intent.expiresAt).to.equal("2026-01-01T00:05:00.000Z");
		expect(intent.grants.room).to.equal("rebound-live-session_123");
		expect(intent.grants.canPublish).to.equal(true);
		expect(intent.grants.canSubscribe).to.equal(true);
		expect(intent.grants).to.not.have.property("roomAdmin");
	});

	it("scopes viewer intent to one room without publishing permissions", () => {
		const intent = createViewerTokenIntent({
			sessionId: "session_123",
			identity: "user-2",
			config,
			now: new Date("2026-01-01T00:00:00.000Z"),
		});

		expect(intent.roomName).to.equal("rebound-live-session_123");
		expect(intent.grants.room).to.equal("rebound-live-session_123");
		expect(intent.grants.canPublish).to.equal(false);
		expect(intent.grants.canSubscribe).to.equal(true);
		expect(intent.grants).to.not.have.property("roomAdmin");
	});

	it("fails only when token intent generation is explicitly requested without config", () => {
		expect(() =>
			createViewerTokenIntent({
				sessionId: "session_123",
				identity: "user-2",
				config: createWebrtcConfig({}),
			})
		).to.throw("Missing LiveKit token configuration");
	});
});
