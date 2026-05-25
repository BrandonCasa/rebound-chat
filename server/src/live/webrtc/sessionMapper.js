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

const mapSessionToLiveKitRoom = (session, options = {}) => ({
	sessionId: session.sessionId,
	publicToken: session.publicToken,
	roomName: buildLiveKitRoomName(session.sessionId, options),
	metadata: {
		status: session.status,
		transportMode: session.transportMode || "hls",
	},
});

export { buildLiveKitRoomName, mapSessionToLiveKitRoom };
