import { expect } from "./helpers/authTestUtils.js";
import { normalizeRedirectTarget, withAuthErrorParam, withAuthSuccessParam } from "../src/routes/api/users.js";

describe("Google OAuth redirects", () => {
	it("allows the Electron app protocol as an OAuth return target", () => {
		expect(normalizeRedirectTarget("app://-/index.html")).to.equal("app://-/index.html");
		expect(normalizeRedirectTarget("app://-/index.html#/chat")).to.equal("app://-/index.html#/chat");
	});

	it("rejects unexpected app protocol hosts", () => {
		expect(normalizeRedirectTarget("app://malicious/index.html")).to.equal(null);
	});

	it("adds OAuth status query params before Electron hash routes", () => {
		expect(withAuthSuccessParam("app://-/index.html#/chat")).to.equal("app://-/index.html?authComplete=google#/chat");
		expect(withAuthErrorParam("app://-/index.html#/chat")).to.equal("app://-/index.html?authError=google#/chat");
	});
});
