export const getLiveBase = () => {
	if (globalThis.IN_ELECTRON_ENV) return "https://rebound.nexus";
	return "";
};

export const getLiveShareApiUrl = (publicToken) => `${getLiveBase()}/live/api/share/${publicToken}`;

export const getLiveStreamsApiUrl = () => `${getLiveBase()}/live/api/streams`;
