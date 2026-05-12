const parseIceServers = (value) => {
	if (!value) return [];

	try {
		const parsed = JSON.parse(value);
		return Array.isArray(parsed) ? parsed : [];
	} catch (_err) {
		return [];
	}
};

const getIceServers = (env = process.env) => parseIceServers(env.LIVEKIT_ICE_SERVERS_JSON);

export { getIceServers, parseIceServers };
