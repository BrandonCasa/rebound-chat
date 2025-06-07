import { expect } from "chai";

process.env.SECRET = "dummy";
let getTokenFromHeader;

before(async () => {
  ({ getTokenFromHeader } = await import("../src/routes/auth.js"));
});

describe("getTokenFromHeader", () => {
  it("returns token from Bearer header", () => {
    const req = { headers: { authorization: "Bearer abc123" } };
    const token = getTokenFromHeader(req);
    expect(token).to.equal("abc123");
  });

  it("returns token from Token header body", () => {
    const req = { body: { headers: { authorization: "Token xyz456" } } };
    const token = getTokenFromHeader(req);
    expect(token).to.equal("xyz456");
  });

  it("returns null when header is missing", () => {
    const req = {};
    const token = getTokenFromHeader(req);
    expect(token).to.be.null;
  });
});
