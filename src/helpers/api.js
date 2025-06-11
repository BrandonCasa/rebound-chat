export const getApiBase = () =>
	process.env.NODE_ENV === "development" ? "http://localhost:6001/api" : window.isElectron ? "https://rebound.nexus/api" : "/api";
