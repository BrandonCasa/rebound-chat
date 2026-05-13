const parsePositiveInt = (value, fallback) => {
	const parsed = Number.parseInt(value, 10);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const firstValue = (source, keys, fallback = "") => {
	for (const key of keys) {
		const value = source?.[key];
		if (value !== undefined && value !== null && value !== "") {
			return value;
		}
	}

	return fallback;
};

const createWebrtcConfig = (source = process.env) => ({
	liveKitUrl: firstValue(source, ["LIVEKIT_URL", "liveKitUrl"]),
	apiKey: firstValue(source, ["LIVEKIT_API_KEY", "liveKitApiKey", "apiKey"]),
	apiSecret: firstValue(source, ["LIVEKIT_API_SECRET", "liveKitApiSecret", "apiSecret"]),
	webhookSecret: firstValue(source, ["LIVEKIT_WEBHOOK_SECRET", "liveKitWebhookSecret", "webhookSecret"]),
	roomPrefix: firstValue(source, ["LIVEKIT_ROOM_PREFIX", "liveKitRoomPrefix", "roomPrefix"], "rebound-live"),
	tokenTtlSeconds: parsePositiveInt(firstValue(source, ["LIVEKIT_TOKEN_TTL_SECONDS", "liveKitTokenTtlSeconds", "tokenTtlSeconds"]), 10 * 60),
});

const getMissingLiveKitTokenConfig = (config = createWebrtcConfig()) => {
	const resolvedConfig = createWebrtcConfig(config);
	const missing = [];
	if (!resolvedConfig.liveKitUrl) missing.push("LIVEKIT_URL");
	if (!resolvedConfig.apiKey) missing.push("LIVEKIT_API_KEY");
	if (!resolvedConfig.apiSecret) missing.push("LIVEKIT_API_SECRET");
	return missing;
};

const getMissingLiveKitWebhookConfig = (config = createWebrtcConfig()) => {
	const resolvedConfig = createWebrtcConfig(config);
	const missing = [];
	if (!resolvedConfig.apiKey) missing.push("LIVEKIT_API_KEY");
	if (!resolvedConfig.apiSecret) missing.push("LIVEKIT_API_SECRET");
	return missing;
};

const assertLiveKitTokenConfig = (config = createWebrtcConfig()) => {
	const resolvedConfig = createWebrtcConfig(config);
	const missing = getMissingLiveKitTokenConfig(resolvedConfig);

	if (missing.length > 0) {
		throw new Error(`Missing LiveKit token configuration: ${missing.join(", ")}`);
	}

	return resolvedConfig;
};

const assertLiveKitWebhookConfig = (config = createWebrtcConfig()) => {
	const resolvedConfig = createWebrtcConfig(config);
	const missing = getMissingLiveKitWebhookConfig(resolvedConfig);

	if (missing.length > 0) {
		throw new Error(`Missing LiveKit webhook configuration: ${missing.join(", ")}`);
	}

	return resolvedConfig;
};

export { assertLiveKitTokenConfig, assertLiveKitWebhookConfig, createWebrtcConfig, getMissingLiveKitTokenConfig, getMissingLiveKitWebhookConfig };
