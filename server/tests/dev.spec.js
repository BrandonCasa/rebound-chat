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

describe("Development utilities", () => {
  it("wipes the database");
  it("creates a test room");
});
