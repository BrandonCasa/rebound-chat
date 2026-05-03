import crypto from "crypto";

const CSRF_COOKIE_NAME = "csrfToken";
const CSRF_HEADER_NAME = "x-csrf-token";
const CSRF_TOKEN_BYTES = 32;
const CSRF_TOKEN_HEX_LENGTH = CSRF_TOKEN_BYTES * 2;
const CSRF_TOKEN_PATTERN = new RegExp(`^[a-f0-9]{${CSRF_TOKEN_HEX_LENGTH}}$`, "i");
const CSRF_PROTECTED_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

const CSRF_COOKIE_OPTIONS = {
	httpOnly: false,
	secure: process.env.NODE_ENV === "production",
	sameSite: "strict",
	path: "/",
};

const createCsrfToken = () => crypto.randomBytes(CSRF_TOKEN_BYTES).toString("hex");

const isValidCsrfToken = (token) => typeof token === "string" && CSRF_TOKEN_PATTERN.test(token);

const appendExposeHeader = (res, headerName = CSRF_HEADER_NAME) => {
	const existingExposeHeaders = res.getHeader("Access-Control-Expose-Headers");
	const existingValues = existingExposeHeaders
		? String(existingExposeHeaders)
				.split(",")
				.map((value) => value.trim().toLowerCase())
		: [];

	if (existingValues.includes(headerName.toLowerCase())) return;

	const nextValue = existingExposeHeaders ? `${existingExposeHeaders}, ${headerName}` : headerName;
	res.setHeader("Access-Control-Expose-Headers", nextValue);
};

const setCsrfResponseHeaders = (res, csrfToken) => {
	res.setHeader(CSRF_HEADER_NAME, csrfToken);
	appendExposeHeader(res);
};

export { CSRF_COOKIE_NAME, CSRF_COOKIE_OPTIONS, CSRF_HEADER_NAME, CSRF_PROTECTED_METHODS, createCsrfToken, isValidCsrfToken, setCsrfResponseHeaders };
