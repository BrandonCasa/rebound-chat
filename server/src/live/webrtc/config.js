const parsePositiveInt = (value, fallback) => {
	const parsed = Number.parseInt(value, 10);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const createWebrtcConfig = (env = process.env) => ({
	liveKitUrl: env.LIVEKIT_URL || "",
	apiKey: env.LIVEKIT_API_KEY || "",
	apiSecret: env.LIVEKIT_API_SECRET || "",
	webhookSecret: env.LIVEKIT_WEBHOOK_SECRET || "",
	roomPrefix: env.LIVEKIT_ROOM_PREFIX || "rebound-live",
	tokenTtlSeconds: parsePositiveInt(env.LIVEKIT_TOKEN_TTL_SECONDS, 10 * 60),
});

const getMissingLiveKitTokenConfig = (config = createWebrtcConfig()) => {
	const missing = [];
	if (!config.liveKitUrl) missing.push("LIVEKIT_URL");
	if (!config.apiKey) missing.push("LIVEKIT_API_KEY");
	if (!config.apiSecret) missing.push("LIVEKIT_API_SECRET");
	return missing;
};

const assertLiveKitTokenConfig = (config = createWebrtcConfig()) => {
	const missing = getMissingLiveKitTokenConfig(config);

	if (missing.length > 0) {
		throw new Error(`Missing LiveKit token configuration: ${missing.join(", ")}`);
	}

	return config;
};

export { assertLiveKitTokenConfig, createWebrtcConfig, getMissingLiveKitTokenConfig };
