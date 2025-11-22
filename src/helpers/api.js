export const getApiBase = () =>
        process.env.NODE_ENV === "development"
                ? "http://localhost:6001/api"
                : globalThis.IN_ELECTRON_ENV
                  ? "https://rebound.nexus/api"
                  : "/api";

const CSRF_COOKIE_NAME = "csrfToken";
const CSRF_HEADER_NAME = "x-csrf-token";
const AUTH_COOKIE_NAME = "authToken";

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

export const getAuthToken = () => getCookie(AUTH_COOKIE_NAME);

export const setAuthTokenCookie = (authToken) => setCookie(AUTH_COOKIE_NAME, authToken);

export const clearAuthCookies = () => {
        clearCookie(AUTH_COOKIE_NAME);
        clearCookie(CSRF_COOKIE_NAME);
};

export const buildApiConfig = (authToken, config = {}) => {
        const csrfToken = getCsrfToken();
        const token = authToken || getAuthToken();
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
