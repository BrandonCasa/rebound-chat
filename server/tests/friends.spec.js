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

describe("Friend request workflow", () => {
	it("sends a friend request");
	it("accepts a friend request");
	it("declines a friend request");
	it("cancels a sent request");
	it("removes a friend");
});
