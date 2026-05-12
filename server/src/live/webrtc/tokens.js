import { assertLiveKitTokenConfig, createWebrtcConfig } from "./config.js";
import { buildLiveKitRoomName } from "./sessionMapper.js";

const tokenRoles = new Set(["publisher", "viewer"]);

const createGrantsForRole = (role, roomName) => {
	if (role === "publisher") {
		return {
			roomJoin: true,
			room: roomName,
			canPublish: true,
			canSubscribe: true,
			canPublishData: true,
		};
	}

	return {
		roomJoin: true,
		room: roomName,
		canPublish: false,
		canSubscribe: true,
		canPublishData: false,
	};
};

const createTokenIntent = ({ role, sessionId, identity, name = "", config = createWebrtcConfig(), now = new Date() }) => {
	if (!tokenRoles.has(role)) {
		throw new Error(`Unsupported LiveKit token role '${role}'.`);
	}

	const resolvedConfig = assertLiveKitTokenConfig(config);
	const roomName = buildLiveKitRoomName(sessionId, { roomPrefix: resolvedConfig.roomPrefix });
	const ttlSeconds = resolvedConfig.tokenTtlSeconds;

	return {
		provider: "livekit",
		role,
		identity,
		name,
		roomName,
		liveKitUrl: resolvedConfig.liveKitUrl,
		ttlSeconds,
		expiresAt: new Date(now.getTime() + ttlSeconds * 1000).toISOString(),
		grants: createGrantsForRole(role, roomName),
	};
};

const createPublisherTokenIntent = (params) => createTokenIntent({ ...params, role: "publisher" });

const createViewerTokenIntent = (params) => createTokenIntent({ ...params, role: "viewer" });

export { createPublisherTokenIntent, createTokenIntent, createViewerTokenIntent };
