import { expect, request, registerUser, loginUser, createBackend, resetUsers } from "./helpers/authTestUtils.js";

describe("Password security", () => {
	let backend;

	before(async () => {
		backend = await createBackend();
	});

	beforeEach(async () => {
		await resetUsers();
	});

	it("invalidates existing tokens after a password change", async () => {
		const agent = request.agent(backend.server);
		const { csrfToken, credentials } = await registerUser(agent);

		const changeRes = await agent.put("/api/users/password").set("x-csrf-token", csrfToken).send({
			currentPassword: credentials.password,
			newPassword: "NewStrongPassword2",
		});
		expect(changeRes.status).to.equal(200);

		const verifyRes = await agent.post("/api/users/verify").set("x-csrf-token", csrfToken);
		expect(verifyRes.status).to.be.oneOf([401, 403]);

		const oldLoginAgent = request.agent(backend.server);
		const oldPasswordLogin = await loginUser(oldLoginAgent, credentials);
		expect(oldPasswordLogin.response.status).to.equal(422);

		const newLoginAgent = request.agent(backend.server);
		const loginRes = await loginUser(newLoginAgent, { email: credentials.email, password: "NewStrongPassword2" });
		expect(loginRes.response.status).to.equal(200);

		agent.close();
		oldLoginAgent.close();
		newLoginAgent.close();
	});
});
