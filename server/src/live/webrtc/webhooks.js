import { createWebrtcConfig } from "./config.js";

const assertWebhookConfig = (config = createWebrtcConfig()) => {
	if (!config.webhookSecret) {
		throw new Error("LIVEKIT_WEBHOOK_SECRET is required to verify LiveKit webhooks.");
	}

	return config;
};

const parseLiveKitWebhookEvent = (payload) => {
	if (Buffer.isBuffer(payload)) {
		return JSON.parse(payload.toString("utf8"));
	}

	if (typeof payload === "string") {
		return JSON.parse(payload);
	}

	return payload;
};

const verifyLiveKitWebhook = ({ payload, signature, config = createWebrtcConfig() }) => {
	assertWebhookConfig(config);

	return {
		verified: false,
		signaturePresent: Boolean(signature),
		event: parseLiveKitWebhookEvent(payload),
		reason: "livekit_webhook_signature_verification_not_wired",
	};
};

export { assertWebhookConfig, parseLiveKitWebhookEvent, verifyLiveKitWebhook };
