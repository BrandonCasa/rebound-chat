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

	it("resets a password with a reset token and revokes existing sessions", async () => {
		const agent = request.agent(backend.server);
		const { csrfToken, credentials } = await registerUser(agent);

		const resetRequestRes = await agent.post("/api/users/password-reset/request").set("x-csrf-token", csrfToken).send({
			email: credentials.email,
		});
		expect(resetRequestRes.status).to.equal(200);
		expect(resetRequestRes.body?.resetToken).to.match(/^[a-f0-9]{64}$/i);

		const resetRes = await agent.post("/api/users/password-reset/confirm").set("x-csrf-token", csrfToken).send({
			token: resetRequestRes.body.resetToken,
			newPassword: "ResetStrongPassword2",
		});
		expect(resetRes.status).to.equal(200);

		const verifyRes = await agent.post("/api/users/verify").set("x-csrf-token", csrfToken);
		expect(verifyRes.status).to.be.oneOf([401, 403]);

		const newCsrfToken = await agent.get("/api/csrf").then((res) => res.body.csrfToken);
		const reusedTokenRes = await agent.post("/api/users/password-reset/confirm").set("x-csrf-token", newCsrfToken).send({
			token: resetRequestRes.body.resetToken,
			newPassword: "AnotherStrongPassword2",
		});
		expect(reusedTokenRes.status).to.equal(422);

		const oldPasswordAgent = request.agent(backend.server);
		const oldPasswordLogin = await loginUser(oldPasswordAgent, credentials);
		expect(oldPasswordLogin.response.status).to.equal(422);

		const newPasswordAgent = request.agent(backend.server);
		const newPasswordLogin = await loginUser(newPasswordAgent, { email: credentials.email, password: "ResetStrongPassword2" });
		expect(newPasswordLogin.response.status).to.equal(200);

		agent.close();
		oldPasswordAgent.close();
		newPasswordAgent.close();
	});

	it("does not reveal whether a password reset email exists", async () => {
		const agent = request.agent(backend.server);
		const csrfToken = await agent.get("/api/csrf").then((res) => res.body.csrfToken);

		const res = await agent.post("/api/users/password-reset/request").set("x-csrf-token", csrfToken).send({
			email: "missing-user@example.com",
		});

		expect(res.status).to.equal(200);
		expect(res.body?.success).to.equal(true);
		expect(res.body?.resetToken).to.not.exist;

		agent.close();
	});
});
