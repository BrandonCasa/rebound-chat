import * as chai from "chai";
import chaiHttp from "chai-http";
import { startServer, stopServer } from "./helpers/server.js";

chai.use(chaiHttp);

before(async () => {
	await startServer();
});

after(async () => {
	await stopServer();
});

describe("Profile API", () => {
	describe("GET /users/profile", () => {
		it("returns the private profile for the owner");
		it("returns a public profile when querying other users");
	});

	describe("PUT /users/modify", () => {
		it("updates profile fields");
		it("uploads avatar and banner images");
	});
});
