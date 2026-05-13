import { getApiBase } from "./api";

export const resolveMediaUrl = (urlIn) => {
	const base = getApiBase();
	if (!urlIn) return "";

	if (urlIn?.startsWith("/") && !urlIn?.startsWith(base) && urlIn?.split("/")?.length - 1 > 1) return base + urlIn;
	return urlIn;
};

export const profileMediaUrl = (urlIn, fallback) => {
	if (!urlIn || urlIn === "" || urlIn === undefined || urlIn === null) return `${globalThis.IN_ELECTRON_ENV ? "" : "/"}${fallback}`;
	return resolveMediaUrl(urlIn);
};
