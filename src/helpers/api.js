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

let csrfTokenRequest = null;

const getCookie = (name) => {
	if (typeof document === "undefined" || !document.cookie) return null;
	const match = document.cookie
		.split(";")
		.map((entry) => entry.trim())
		.find((entry) => entry.startsWith(`${name}=`));
	if (!match) return null;
	const value = match.slice(name.length + 1);
	return decodeURIComponent(value || "");
};

const setCookie = (name, value) => {
	if (!value || typeof document === "undefined") return;
	const secureFlag = window.location.protocol === "https:" ? "; Secure" : "";
	document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; SameSite=Strict${secureFlag}`;
};

export const clearCookie = (name) => {
	if (typeof document === "undefined") return;
	document.cookie = `${name}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
};

export const getCsrfToken = () => getCookie(CSRF_COOKIE_NAME);

export const setCsrfTokenCookie = (csrfToken) => setCookie(CSRF_COOKIE_NAME, csrfToken);

export const ensureCsrfToken = async () => {
	const existingToken = getCsrfToken();
	if (existingToken) return existingToken;

	if (!csrfTokenRequest) {
		csrfTokenRequest = fetch(`${getApiBase()}/csrf`, {
			credentials: "include",
			headers: { Accept: "application/json" },
		})
			.then(async (response) => {
				if (!response.ok) {
					throw new Error("Unable to initialize CSRF token");
				}

				const data = await response.json().catch(() => ({}));
				const csrfToken = data?.csrfToken || response.headers.get(CSRF_HEADER_NAME);

				if (!csrfToken) {
					throw new Error("CSRF token was not returned by the server");
				}

				setCsrfTokenCookie(csrfToken);
				return csrfToken;
			})
			.finally(() => {
				csrfTokenRequest = null;
			});
	}

	return csrfTokenRequest;
};

export const setAuthSessionCookie = () => setCookie(AUTH_SESSION_COOKIE_NAME, "true");

export const clearAuthSessionCookie = () => clearCookie(AUTH_SESSION_COOKIE_NAME);

export const hasAuthSessionCookie = () => Boolean(getCookie(AUTH_SESSION_COOKIE_NAME));

export const clearAuthCookies = () => {
	clearCookie(AUTH_COOKIE_NAME);
	clearCookie(CSRF_COOKIE_NAME);
	clearAuthSessionCookie();
};

export const buildApiConfig = (authToken, config = {}) => {
	const { csrfToken: explicitCsrfToken, ...requestConfig } = config;
	const csrfToken = explicitCsrfToken || getCsrfToken();
	const token = authToken;
	const headers = {
		...(csrfToken ? { [CSRF_HEADER_NAME]: csrfToken } : {}),
		...(token ? { Authorization: `Bearer ${token}` } : {}),
		...(requestConfig.headers || {}),
	};

	return {
		withCredentials: true,
		...requestConfig,
		headers,
	};
};

export const buildCsrfApiConfig = async (authToken, config = {}) => {
	const csrfToken = await ensureCsrfToken();
	return buildApiConfig(authToken, { ...config, csrfToken });
};
