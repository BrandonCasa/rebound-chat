import { expect, request, extractCookie, registerUser, createBackend, resetUsers } from "./helpers/authTestUtils.js";

describe("Protected routes", () => {
	let backend;

	before(async () => {
		backend = await createBackend();
	});

	beforeEach(async () => {
		await resetUsers();
	});

	it("rejects access without a token", async () => {
		const agent = request.agent(backend.server);

		const res = await agent.post("/api/users/verify");
		expect(res.status).to.be.oneOf([401, 403]);

		agent.close();
	});

	it("rejects malformed access tokens", async () => {
		const agent = request.agent(backend.server);

		const res = await agent.post("/api/users/verify").set("Cookie", "token=not-a-valid-token").set("x-csrf-token", "fake-csrf");
		expect(res.status).to.be.oneOf([401, 403]);

		agent.close();
	});

	it("issues a readable CSRF token for app requests", async () => {
		const agent = request.agent(backend.server);

		const res = await agent.get("/api/csrf");
		const csrfToken = res.body?.csrfToken;

		expect(res.status).to.equal(200);
		expect(csrfToken).to.be.a("string");
		expect(res.headers?.["x-csrf-token"]).to.equal(csrfToken);
		expect(extractCookie(res, "csrfToken")).to.equal(csrfToken);

		agent.close();
	});

	it("rejects authenticated unsafe requests without a matching CSRF header", async () => {
		const agent = request.agent(backend.server);

		await registerUser(agent);

		const res = await agent.put("/api/users/password").send({
			currentPassword: "strongPassword1",
			newPassword: "anotherStrongPassword1",
		});

		expect(res.status).to.equal(403);

		agent.close();
	});
});
