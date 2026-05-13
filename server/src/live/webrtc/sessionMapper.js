const normalizeRoomComponent = (value) =>
	String(value || "")
		.trim()
		.replace(/[^a-zA-Z0-9_-]+/g, "-")
		.replace(/^-+|-+$/g, "");

const buildLiveKitRoomName = (sessionId, { roomPrefix = "rebound-live" } = {}) => {
	const safeSessionId = normalizeRoomComponent(sessionId);
	const safePrefix = normalizeRoomComponent(roomPrefix) || "rebound-live";

	if (!safeSessionId) {
		throw new Error("A sessionId is required to build a LiveKit room name.");
	}

	return `${safePrefix}-${safeSessionId}`;
};

const parseSessionIdFromLiveKitRoomName = (roomName, { roomPrefix = "rebound-live" } = {}) => {
	const safeRoomName = normalizeRoomComponent(roomName);
	const safePrefix = normalizeRoomComponent(roomPrefix) || "rebound-live";
	const prefix = `${safePrefix}-`;

	if (!safeRoomName.startsWith(prefix)) {
		return "";
	}

	return safeRoomName.slice(prefix.length);
};

const mapSessionToLiveKitRoom = (session, options = {}) => ({
	sessionId: session.sessionId,
	publicToken: session.publicToken,
	roomName: buildLiveKitRoomName(session.sessionId, options),
	metadata: {
		status: session.status,
		transportMode: session.transportMode || "hls",
	},
});

const getLiveKitWebhookRoomName = (event) => event?.room?.name || event?.roomName || "";

const mapLiveKitWebhookEventToSession = (event, options = {}) => {
	const roomName = getLiveKitWebhookRoomName(event);
	const sessionId = roomName ? parseSessionIdFromLiveKitRoomName(roomName, options) : "";

	return {
		provider: "livekit",
		eventName: event?.event || "",
		roomName,
		sessionId,
	};
};

export { buildLiveKitRoomName, mapLiveKitWebhookEventToSession, mapSessionToLiveKitRoom, parseSessionIdFromLiveKitRoomName };
