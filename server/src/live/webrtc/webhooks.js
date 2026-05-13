import { WebhookReceiver } from "livekit-server-sdk";

import { assertLiveKitWebhookConfig, createWebrtcConfig } from "./config.js";
import { mapLiveKitWebhookEventToSession } from "./sessionMapper.js";

const parseLiveKitWebhookEvent = (payload) => {
	if (Buffer.isBuffer(payload)) {
		return JSON.parse(payload.toString("utf8"));
	}

	if (typeof payload === "string") {
		return JSON.parse(payload);
	}

	return payload;
};

const normalizeWebhookBody = (payload) => {
	if (Buffer.isBuffer(payload)) {
		return payload.toString("utf8");
	}

	if (typeof payload === "string") {
		return payload;
	}

	return JSON.stringify(payload);
};

const verifyLiveKitWebhook = async ({ payload, authorization, signature, config = createWebrtcConfig() }) => {
	const resolvedConfig = assertLiveKitWebhookConfig(config);
	const body = normalizeWebhookBody(payload);
	const authHeader = authorization || signature || "";
	const receiver = new WebhookReceiver(resolvedConfig.apiKey, resolvedConfig.apiSecret);
	const event = await receiver.receive(body, authHeader);
	const mappedSession = mapLiveKitWebhookEventToSession(event, { roomPrefix: resolvedConfig.roomPrefix });

	return {
		verified: true,
		signaturePresent: Boolean(authHeader),
		event,
		...mappedSession,
	};
};

export { normalizeWebhookBody, parseLiveKitWebhookEvent, verifyLiveKitWebhook };
