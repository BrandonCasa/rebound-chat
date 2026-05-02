import { expect, request, createBackend, resetUsers } from "./helpers/authTestUtils.js";

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
});
