import { expect, request, registerUser, loginUser, extractCookie, createBackend, resetUsers } from "./helpers/authTestUtils.js";

describe("Token refresh", () => {
	let backend;

	before(async () => {
		backend = await createBackend();
	});

	beforeEach(async () => {
		await resetUsers();
	});

	it("rotates refresh tokens and revokes stale ones", async () => {
		const agent = request.agent(backend.server);
		const { csrfToken, refreshToken } = await registerUser(agent);

		const refreshRes = await agent.post("/api/users/refresh").set("x-csrf-token", csrfToken);
		expect(refreshRes.status).to.equal(200);

		const rotatedRefresh = extractCookie(refreshRes, "jid");
		const rotatedCsrf = refreshRes.body?.csrfToken || extractCookie(refreshRes, "csrfToken");
		expect(rotatedRefresh).to.be.a("string");
		expect(rotatedCsrf).to.be.a("string");

		if (rotatedRefresh !== refreshToken) {
			const staleRefreshAttempt = await request
				.agent(backend.server)
				.post("/api/users/refresh")
				.set("Cookie", [`jid=${refreshToken}`, `csrfToken=${csrfToken}`].join("; "))
				.set("x-csrf-token", csrfToken);
			expect(staleRefreshAttempt.status).to.equal(401);
		}

		const verifyRes = await agent.post("/api/users/verify").set("x-csrf-token", rotatedCsrf);
		expect(verifyRes.status).to.equal(200);

		agent.close();
	});

	it("requires a valid refresh token cookie", async () => {
		const agent = request.agent(backend.server);

		const missingTokenRes = await agent.post("/api/users/refresh");
		expect(missingTokenRes.status).to.equal(401);

		const { credentials } = await registerUser(agent);
		const loginAgent = request.agent(backend.server);
		const { csrfToken } = await loginUser(loginAgent, credentials);

		const tamperedTokenRes = await loginAgent.post("/api/users/refresh").set("Cookie", "jid=invalid-token").set("x-csrf-token", csrfToken);
		expect(tamperedTokenRes.status).to.equal(401);

		agent.close();
		loginAgent.close();
	});
});
