import crypto from "node:crypto";

import { AccessToken, TokenVerifier } from "livekit-server-sdk";
import { expect } from "chai";

import { createWebrtcConfig, getMissingLiveKitTokenConfig } from "../src/live/webrtc/config.js";
import { buildLiveKitRoomName, parseSessionIdFromLiveKitRoomName } from "../src/live/webrtc/sessionMapper.js";
import { createPublisherToken, createPublisherTokenIntent, createViewerToken } from "../src/live/webrtc/tokens.js";
import { verifyLiveKitWebhook } from "../src/live/webrtc/webhooks.js";

const config = createWebrtcConfig({
	LIVEKIT_URL: "wss://livekit.example.test",
	LIVEKIT_API_KEY: "test-key",
	LIVEKIT_API_SECRET: "test-secret",
	LIVEKIT_ROOM_PREFIX: "rebound-live",
	LIVEKIT_TOKEN_TTL_SECONDS: "300",
});

const verifyToken = (token) => new TokenVerifier(config.apiKey, config.apiSecret).verify(token, 60);

const createWebhookAuthorization = async (body) => {
	const accessToken = new AccessToken(config.apiKey, config.apiSecret);
	accessToken.sha256 = crypto.createHash("sha256").update(body).digest("base64");
	return accessToken.toJwt();
};

describe("LiveKit WebRTC integration helpers", () => {
	it("imports without requiring LiveKit environment variables", () => {
		expect(getMissingLiveKitTokenConfig(createWebrtcConfig({}))).to.deep.equal(["LIVEKIT_URL", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET"]);
	});

	it("locks room naming to one stream session", () => {
		expect(buildLiveKitRoomName("session_123")).to.equal("rebound-live-session_123");
		expect(buildLiveKitRoomName("session 123", { roomPrefix: "custom prefix" })).to.equal("custom-prefix-session-123");
		expect(parseSessionIdFromLiveKitRoomName("rebound-live-session_123")).to.equal("session_123");
		expect(parseSessionIdFromLiveKitRoomName("other-session_123")).to.equal("");
	});

	it("scopes publisher tokens to one room with publishing permissions", async () => {
		const tokenDetails = await createPublisherToken({
			sessionId: "session_123",
			identity: "user-1",
			name: "Publisher",
			metadata: { sessionId: "session_123", role: "publisher" },
			config,
			now: new Date("2026-01-01T00:00:00.000Z"),
		});
		const claims = await verifyToken(tokenDetails.token);

		expect(tokenDetails.roomName).to.equal("rebound-live-session_123");
		expect(tokenDetails.ttlSeconds).to.equal(300);
		expect(tokenDetails.expiresAt).to.equal("2026-01-01T00:05:00.000Z");
		expect(claims.sub).to.equal("user-1");
		expect(claims.video.room).to.equal("rebound-live-session_123");
		expect(claims.video.roomJoin).to.equal(true);
		expect(claims.video.canPublish).to.equal(true);
		expect(claims.video.canSubscribe).to.equal(true);
		expect(claims.video.canPublishData).to.equal(true);
		expect(claims.video).to.not.have.property("roomAdmin");
		expect(JSON.parse(claims.metadata)).to.deep.equal({ sessionId: "session_123", role: "publisher" });
	});

	it("scopes viewer tokens to one room without publishing permissions", async () => {
		const tokenDetails = await createViewerToken({
			sessionId: "session_123",
			identity: "user-2",
			config,
			now: new Date("2026-01-01T00:00:00.000Z"),
		});
		const claims = await verifyToken(tokenDetails.token);

		expect(tokenDetails.roomName).to.equal("rebound-live-session_123");
		expect(claims.sub).to.equal("user-2");
		expect(claims.video.room).to.equal("rebound-live-session_123");
		expect(claims.video.roomJoin).to.equal(true);
		expect(claims.video.canPublish).to.equal(false);
		expect(claims.video.canSubscribe).to.equal(true);
		expect(claims.video.canPublishData).to.equal(false);
		expect(claims.video).to.not.have.property("roomAdmin");
	});

	it("fails only when token generation is explicitly requested without config", () => {
		expect(() =>
			createPublisherTokenIntent({
				sessionId: "session_123",
				identity: "user-1",
				config: createWebrtcConfig({}),
			})
		).to.throw("Missing LiveKit token configuration");
	});

	it("verifies signed LiveKit webhooks and maps rooms back to session ids", async () => {
		const payload = JSON.stringify({
			event: "room_started",
			room: {
				name: "rebound-live-session_123",
			},
		});
		const authorization = await createWebhookAuthorization(payload);

		const webhook = await verifyLiveKitWebhook({
			payload: Buffer.from(payload),
			authorization,
			config,
		});

		expect(webhook.verified).to.equal(true);
		expect(webhook.signaturePresent).to.equal(true);
		expect(webhook.eventName).to.equal("room_started");
		expect(webhook.roomName).to.equal("rebound-live-session_123");
		expect(webhook.sessionId).to.equal("session_123");
	});

	it("rejects webhooks with a mismatched body signature", async () => {
		const payload = JSON.stringify({ event: "room_started", room: { name: "rebound-live-session_123" } });
		const authorization = await createWebhookAuthorization(payload);

		let error = null;
		try {
			await verifyLiveKitWebhook({
				payload: JSON.stringify({ event: "room_started", room: { name: "rebound-live-other" } }),
				authorization,
				config,
			});
		} catch (err) {
			error = err;
		}

		expect(error).to.be.instanceOf(Error);
		expect(error.message).to.include("checksum");
	});
});
