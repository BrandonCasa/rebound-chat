import { getApiBase } from "./api";

export const profileMediaUrl = (urlIn, fallback) => {
	const base = getApiBase();

	if (urlIn?.startsWith("/") && !urlIn?.startsWith(base) && urlIn?.split("/")?.length - 1 > 1) return base + urlIn;
	if (!urlIn || urlIn === "" || urlIn === undefined || urlIn === null) return `${globalThis.IN_ELECTRON_ENV ? "" : "/"}${fallback}`;
	return urlIn;
};
