const getOrigin = () => (typeof window !== "undefined" && window.location?.origin ? window.location.origin : "");

export const getLiveBase = () => {
	const nodeEnv = process.env.NODE_ENV;

	if ((!nodeEnv || nodeEnv === "development") && globalThis?.IN_ELECTRON_ENV) return "http://localhost:6001";
	if (nodeEnv === "production" && globalThis?.IN_ELECTRON_ENV) return "https://rebound.nexus";
	return "";
};

const resolveLiveApiUrl = (pathname) => {
	const base = getLiveBase() || getOrigin();
	if (!base) return pathname;
	return new URL(pathname, `${base}/`).toString();
};

export const getLiveShareApiUrl = (publicToken) => resolveLiveApiUrl(`/live/api/share/${publicToken}`);

export const getLiveStreamsApiUrl = () => resolveLiveApiUrl("/live/api/streams");

export const buildLiveAuthHeaders = (authToken, headers = {}) => ({
	...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
	...headers,
});

export const buildLiveFetchConfig = (authToken, config = {}) => ({
	credentials: "same-origin",
	...config,
	headers: buildLiveAuthHeaders(authToken, config.headers),
});

const resolveLiveAuthToken = (authToken) => (typeof authToken === "function" ? authToken() : authToken);

export const buildLiveHlsConfig = (authToken) => ({
	xhrSetup: (xhr) => {
		const token = resolveLiveAuthToken(authToken);
		if (token) {
			xhr.setRequestHeader("Authorization", `Bearer ${token}`);
		}
	},
});
