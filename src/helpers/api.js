export const getApiBase = () => {
	//const envBase = typeof import.meta !== "undefined" ? import.meta.env?.VITE_API_BASE_URL : undefined;
	//if (process.env.NODE_ENV === "development" & envBase) return envBase;
	if (process.env.NODE_ENV === "development") return "/api";
	if (globalThis.IN_ELECTRON_ENV) return "https://rebound.nexus/api";
	return "/api";
};

const CSRF_COOKIE_NAME = "csrfToken";
const CSRF_HEADER_NAME = "x-csrf-token";
const AUTH_COOKIE_NAME = "authToken";
const AUTH_SESSION_COOKIE_NAME = "auth-session-present";

const getCookie = (name) => {
	if (typeof document === "undefined" || !document.cookie) return null;
	const match = document.cookie
		.split(";")
		.map((entry) => entry.trim())
		.find((entry) => entry.startsWith(`${name}=`));
	if (!match) return null;
	const [, value] = match.split("=");
	return decodeURIComponent(value || "");
};

const setCookie = (name, value) => {
	if (!value || typeof document === "undefined") return;
	const secureFlag = window.location.protocol === "https:" ? "; Secure" : "";
	document.cookie = `${name}=${value}; Path=/; SameSite=Strict${secureFlag}`;
};

export const clearCookie = (name) => {
	if (typeof document === "undefined") return;
	document.cookie = `${name}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
};

export const getCsrfToken = () => getCookie(CSRF_COOKIE_NAME);

export const setCsrfTokenCookie = (csrfToken) => setCookie(CSRF_COOKIE_NAME, csrfToken);

export const setAuthSessionCookie = () => setCookie(AUTH_SESSION_COOKIE_NAME, "true");

export const clearAuthSessionCookie = () => clearCookie(AUTH_SESSION_COOKIE_NAME);

export const hasAuthSessionCookie = () => Boolean(getCookie(AUTH_SESSION_COOKIE_NAME));

export const clearAuthCookies = () => {
	clearCookie(AUTH_COOKIE_NAME);
	clearCookie(CSRF_COOKIE_NAME);
	clearAuthSessionCookie();
};

export const buildApiConfig = (authToken, config = {}) => {
	const csrfToken = getCsrfToken();
	const token = authToken;
	const headers = {
		...(csrfToken ? { [CSRF_HEADER_NAME]: csrfToken } : {}),
		...(token ? { Authorization: `Bearer ${token}` } : {}),
		...(config.headers || {}),
	};

	return {
		withCredentials: true,
		...config,
		headers,
	};
};
