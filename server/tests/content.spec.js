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

describe("Content API", () => {
  describe("GET /content/:filename", () => {
    it("retrieves files from GridFS");
  });
});
