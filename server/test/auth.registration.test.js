import { expect, request, registerUser, createBackend, resetUsers } from "./helpers/authTestUtils.js";

describe("User registration", () => {
	let backend;

	before(async () => {
		backend = await createBackend();
	});

	beforeEach(async () => {
		await resetUsers();
	});

	it("registers a user, issues tokens, and allows verification", async () => {
		const agent = request.agent(backend.server);

		const { csrfToken, refreshToken, accessToken, response } = await registerUser(agent);

		expect(response.status).to.equal(200);
		expect(refreshToken).to.be.a("string");
		expect(accessToken).to.be.a("string");
		expect(csrfToken).to.be.a("string");

		const verifyRes = await agent.post("/api/users/verify").set("x-csrf-token", csrfToken);
		expect(verifyRes.status).to.equal(200);
		expect(verifyRes.body?.user?.email).to.exist;

		agent.close();
	});

	it("rejects weak passwords during registration", async () => {
		const agent = request.agent(backend.server);

		const res = await agent.post("/api/users/register").send({
			user: {
				username: "shortuser",
				email: "shortuser@example.com",
				displayName: "Short User",
				bio: "",
				password: "short",
			},
		});

		expect(res.status).to.equal(422);
		expect(res.body?.errors?.password).to.exist;

		agent.close();
	});
});
