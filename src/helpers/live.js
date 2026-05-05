const getNodeEnv = () => (typeof process !== "undefined" && process?.env ? process.env.NODE_ENV : undefined);

export const getLiveBase = () => {
	const nodeEnv = getNodeEnv();

	if ((!nodeEnv || nodeEnv === "development") && globalThis?.IN_ELECTRON_ENV) return "http://localhost:6001";
	if (nodeEnv === "production" && globalThis?.IN_ELECTRON_ENV) return "https://rebound.nexus";
	return "";
};

export const getLiveShareApiUrl = (publicToken) => `${getLiveBase()}/live/api/share/${publicToken}`;

export const getLiveStreamsApiUrl = () => `${getLiveBase()}/live/api/streams`;

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
