import { AccessToken } from "livekit-server-sdk";

import { assertLiveKitTokenConfig, createWebrtcConfig } from "./config.js";
import { buildLiveKitRoomName } from "./sessionMapper.js";

const tokenRoles = new Set(["publisher", "viewer"]);

const normalizeIdentity = (identity) => String(identity || "").trim();

const createGrantsForRole = (role, roomName) => {
	if (role === "publisher") {
		return {
			roomJoin: true,
			room: roomName,
			canPublish: true,
			canSubscribe: true,
			canPublishData: true,
			canUpdateOwnMetadata: true,
		};
	}

	return {
		roomJoin: true,
		room: roomName,
		canPublish: false,
		canSubscribe: true,
		canPublishData: false,
		canUpdateOwnMetadata: false,
	};
};

const createTokenIntent = ({ role, sessionId, identity, name = "", metadata = null, config = createWebrtcConfig(), now = new Date() }) => {
	if (!tokenRoles.has(role)) {
		throw new Error(`Unsupported LiveKit token role '${role}'.`);
	}

	const resolvedConfig = assertLiveKitTokenConfig(config);
	const normalizedIdentity = normalizeIdentity(identity);
	if (!normalizedIdentity) {
		throw new Error("A participant identity is required to create a LiveKit token.");
	}

	const roomName = buildLiveKitRoomName(sessionId, { roomPrefix: resolvedConfig.roomPrefix });
	const ttlSeconds = resolvedConfig.tokenTtlSeconds;

	return {
		provider: "livekit",
		role,
		identity: normalizedIdentity,
		name,
		metadata,
		roomName,
		liveKitUrl: resolvedConfig.liveKitUrl,
		ttlSeconds,
		expiresAt: new Date(now.getTime() + ttlSeconds * 1000).toISOString(),
		grants: createGrantsForRole(role, roomName),
	};
};

const createToken = async (params) => {
	const intent = createTokenIntent(params);
	const resolvedConfig = assertLiveKitTokenConfig(params.config);
	const accessToken = new AccessToken(resolvedConfig.apiKey, resolvedConfig.apiSecret, {
		identity: intent.identity,
		name: intent.name || undefined,
		metadata: intent.metadata ? JSON.stringify(intent.metadata) : undefined,
		ttl: intent.ttlSeconds,
	});

	accessToken.addGrant(intent.grants);

	return {
		...intent,
		token: await accessToken.toJwt(),
	};
};

const createPublisherTokenIntent = (params) => createTokenIntent({ ...params, role: "publisher" });

const createViewerTokenIntent = (params) => createTokenIntent({ ...params, role: "viewer" });

const createPublisherToken = (params) => createToken({ ...params, role: "publisher" });

const createViewerToken = (params) => createToken({ ...params, role: "viewer" });

export { createPublisherToken, createPublisherTokenIntent, createToken, createTokenIntent, createViewerToken, createViewerTokenIntent };
