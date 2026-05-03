import { expect, request, fetchCsrfToken, registerUser, loginUser, createBackend, resetUsers } from "./helpers/authTestUtils.js";

describe("User login", () => {
	let backend;

	before(async () => {
		backend = await createBackend();
	});

	beforeEach(async () => {
		await resetUsers();
	});

	it("issues fresh tokens on login and enables verification", async () => {
		const registrationAgent = request.agent(backend.server);
		const { credentials } = await registerUser(registrationAgent);
		registrationAgent.close();

		const authAgent = request.agent(backend.server);
		const { csrfToken, response } = await loginUser(authAgent, credentials);

		expect(response.status).to.equal(200);
		expect(csrfToken).to.be.a("string");

		const verifyRes = await authAgent.post("/api/users/verify").set("x-csrf-token", csrfToken);
		expect(verifyRes.status).to.equal(200);

		authAgent.close();
	});

	it("requires both email and password", async () => {
		const agent = request.agent(backend.server);
		const csrfToken = await fetchCsrfToken(agent);

		const missingPassword = await agent
			.post("/api/users/login")
			.set("x-csrf-token", csrfToken)
			.send({ user: { email: "user@example.com" } });
		expect(missingPassword.status).to.equal(422);

		const missingEmail = await agent
			.post("/api/users/login")
			.set("x-csrf-token", csrfToken)
			.send({ user: { password: "strongPassword1" } });
		expect(missingEmail.status).to.equal(422);

		agent.close();
	});

	it("rejects invalid password attempts", async () => {
		const registrationAgent = request.agent(backend.server);
		const { credentials } = await registerUser(registrationAgent);

		const csrfToken = await fetchCsrfToken(registrationAgent);
		const loginRes = await registrationAgent
			.post("/api/users/login")
			.set("x-csrf-token", csrfToken)
			.send({ user: { ...credentials, password: "wrongPassword!" } });

		expect(loginRes.status).to.equal(422);

		registrationAgent.close();
	});
});
