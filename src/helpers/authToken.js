const decodeJwtPayload = (token) => {
	if (!token) return null;
	const segments = token.split(".");
	if (segments.length < 2) return null;

	try {
		const base64 = segments[1].replace(/-/g, "+").replace(/_/g, "/");
		const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
		const payload = JSON.parse(atob(padded));
		return payload;
	} catch (err) {
		console.error("Failed to decode JWT payload", err);
		return null;
	}
};

export const getTokenExpiry = (token) => {
	const payload = decodeJwtPayload(token);

	if (!payload || typeof payload.exp !== "number") return null;

	return payload.exp * 1000;
};
