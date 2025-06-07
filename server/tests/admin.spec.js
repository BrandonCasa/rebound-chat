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

describe("Admin utilities", () => {
  describe("POST /admin/users/delete", () => {
    it("cleans up data when deleting a user");
  });
});
