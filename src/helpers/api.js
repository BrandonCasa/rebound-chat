export const getApiBase = () =>
	process.env.NODE_ENV === "development" ? "http://localhost:6001/api" : globalThis.IN_ELECTRON_ENV ? "https://rebound.nexus/api" : "/api";
