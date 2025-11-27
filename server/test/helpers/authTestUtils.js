import { createRequire } from "node:module";

process.env.NODE_ENV = "test";
process.env.ACCESS_TOKEN_SECRET = process.env.ACCESS_TOKEN_SECRET || "test-access-secret";
process.env.REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET || "test-refresh-secret";

const require = createRequire(import.meta.url);
const chai = require("chai");
const chaiHttpModule = require("chai-http");
const chaiHttp = chaiHttpModule.default ?? chaiHttpModule;
const request = chaiHttpModule.request;

chai.use(chaiHttp);

const { ServerBackend } = await import("../../src/app.js");
const UserModel = (await import("../../src/models/User.js")).default;

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
	const res = await agent.post("/api/users/register").send({ user: userPayload });
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
	let requester = agent.post("/api/users/login");
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
};

process.once("exit", () => {
	if (backendPromise) {
		backendPromise.then((backend) => backend.stopBackend());
	}
});

const resetUsers = async () => {
	await UserModel.deleteMany({});
};

export { expect, request, extractCookie, registerUser, loginUser, createBackend, stopBackend, resetUsers };
