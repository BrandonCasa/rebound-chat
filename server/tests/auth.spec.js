import * as chai from "chai";
import chaiHttp from "chai-http";
import { startServer, stopServer } from "./helpers/server.js";

chai.use(chaiHttp);

// Placeholder server instance - will be assigned in startServer()
let request;

before(async () => {
  await startServer();
  // request = chai.request('http://localhost:6001');
});

after(async () => {
  await stopServer();
});

describe("Authentication API", () => {
  describe("POST /users/verify", () => {
    it("verifies a user token");
  });

  describe("POST /users/login", () => {
    it("logs in a user with valid credentials");
  });

  describe("POST /users/register", () => {
    it("registers a new user");
  });
});
