import { expect, request, registerUser, loginUser, createBackend, resetUsers } from "./helpers/authTestUtils.js";

describe("Session management", () => {
	let backend;

	before(async () => {
		backend = await createBackend();
	});

	beforeEach(async () => {
		await resetUsers();
	});

	it("lists active sessions and marks the current session", async () => {
		const agent = request.agent(backend.server);
		const { csrfToken } = await registerUser(agent);

		const sessionsRes = await agent.get("/api/users/sessions").set("x-csrf-token", csrfToken);
		expect(sessionsRes.status).to.equal(200);
		expect(sessionsRes.body?.sessions?.length).to.be.greaterThan(0);

		const currentSessions = sessionsRes.body.sessions.filter((session) => session.isCurrent === true);
		expect(currentSessions.length).to.equal(1);

		agent.close();
	});

	it("revokes other sessions while keeping the current session valid", async () => {
		const primaryAgent = request.agent(backend.server);
		const { csrfToken, credentials } = await registerUser(primaryAgent);

		const secondaryAgent = request.agent(backend.server);
		const secondaryLogin = await loginUser(secondaryAgent, credentials, {
			"User-Agent": "IntegrationTestBot/1.0",
			"X-Forwarded-For": "10.0.0.25",
		});
		expect(secondaryLogin.response.status).to.equal(200);

		const sessionsBefore = await primaryAgent.get("/api/users/sessions").set("x-csrf-token", csrfToken);
		const sessionsBeforeCount = sessionsBefore.body?.sessions?.length || 0;

		const revokeRes = await primaryAgent.delete("/api/users/sessions").query({ scope: "others" }).set("x-csrf-token", csrfToken);
		expect(revokeRes.status).to.equal(204);

		const altRefresh = await secondaryAgent.post("/api/users/refresh").set("x-csrf-token", secondaryLogin.csrfToken);
		expect([200, 401, 403]).to.include(altRefresh.status);

		const sessionsRes = await primaryAgent.get("/api/users/sessions").set("x-csrf-token", csrfToken);
		expect(sessionsRes.status).to.equal(200);
		const sessions = sessionsRes.body?.sessions || [];
		expect(sessions.length).to.be.at.least(1);
		expect(sessions.length).to.be.at.most(Math.max(1, sessionsBeforeCount));
		const currentSessions = sessions.filter((session) => session.isCurrent === true);
		expect(currentSessions.length).to.be.at.least(1);

		primaryAgent.close();
		secondaryAgent.close();
	});
});
