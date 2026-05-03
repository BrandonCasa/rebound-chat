import fs from "node:fs/promises";
import { createRequire } from "node:module";

process.env.NODE_ENV = "test";
process.env.ACCESS_TOKEN_SECRET = process.env.ACCESS_TOKEN_SECRET || "test-access-secret";
process.env.REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET || "test-refresh-secret";
process.env.LIVE_INGEST_CREATE_TOKEN = process.env.LIVE_INGEST_CREATE_TOKEN || "test-live-create-token";
process.env.LIVE_STORAGE_DIR = process.env.LIVE_STORAGE_DIR || "./test-live-storage";

const require = createRequire(import.meta.url);
const chai = require("chai");
const chaiHttpModule = require("chai-http");
const chaiHttp = chaiHttpModule.default ?? chaiHttpModule;
const request = chaiHttpModule.request;

chai.use(chaiHttp);

const { ServerBackend } = await import("../../src/app.js");
const UserModel = (await import("../../src/models/User.js")).default;
const StreamSessionModel = (await import("../../src/models/StreamSession.js")).default;

let backendPromise = null;

const { expect } = chai;

const extractCookie = (res, name) => {
	const cookies = res.headers?.["set-cookie"] || [];
	for (const cookie of cookies) {
		const match = cookie.match(new RegExp(`${name}=([^;]+)`));
		if (match) return match[1];
	}
	return null;
};

const fetchCsrfToken = async (agent) => {
	const res = await agent.get("/api/csrf");
	return res.body?.csrfToken || res.headers?.["x-csrf-token"] || extractCookie(res, "csrfToken");
};

const uniqueUserPayload = (overrides = {}) => {
	const uniqueSuffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
	return {
		username: `user${uniqueSuffix}`,
		email: `user${uniqueSuffix}@example.com`,
		displayName: "Test User",
		bio: "",
		password: "strongPassword1",
		...overrides,
	};
};

const registerUser = async (agent, overrides = {}) => {
	const userPayload = uniqueUserPayload(overrides);
	const requestCsrfToken = await fetchCsrfToken(agent);
	const res = await agent.post("/api/users/register").set("x-csrf-token", requestCsrfToken).send({ user: userPayload });
	const csrfToken = res.body?.csrfToken || extractCookie(res, "csrfToken");

	return {
		response: res,
		csrfToken,
		refreshToken: extractCookie(res, "jid"),
		accessToken: extractCookie(res, "token"),
		credentials: { email: userPayload.email, password: userPayload.password },
	};
};

const loginUser = async (agent, credentials, headers = {}) => {
	const requestCsrfToken = await fetchCsrfToken(agent);
	let requester = agent.post("/api/users/login").set("x-csrf-token", requestCsrfToken);
	Object.entries(headers).forEach(([key, value]) => {
		requester = requester.set(key, value);
	});

	const res = await requester.send({ user: credentials });
	const csrfToken = res.body?.csrfToken || extractCookie(res, "csrfToken");

	return {
		response: res,
		csrfToken,
		refreshToken: extractCookie(res, "jid"),
		accessToken: extractCookie(res, "token"),
	};
};

const createBackend = async () => {
	if (!backendPromise) {
		backendPromise = (async () => {
			const backend = new ServerBackend();
			await backend.startBackend({ startSockets: false, httpPort: 0 });
			return backend;
		})();
	}

	return backendPromise;
};

const stopBackend = async () => {
	if (backendPromise) {
		const backend = await backendPromise;
		backendPromise = null;
		await backend.stopBackend();
	}

	await fs.rm(process.env.LIVE_STORAGE_DIR, { recursive: true, force: true });
};

process.once("exit", () => {
	if (backendPromise) {
		backendPromise.then((backend) => backend.stopBackend());
	}
});

const resetUsers = async () => {
	await UserModel.deleteMany({});
};

const resetLiveSessions = async () => {
	await StreamSessionModel.deleteMany({});
	await fs.rm(process.env.LIVE_STORAGE_DIR, { recursive: true, force: true });
};

export { expect, request, extractCookie, fetchCsrfToken, registerUser, loginUser, createBackend, stopBackend, resetUsers, resetLiveSessions };
