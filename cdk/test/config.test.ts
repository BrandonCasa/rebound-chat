import { App } from "aws-cdk-lib";
import { describe, expect, it } from "vitest";

import { getEnvironmentConfig } from "../lib/config";

describe("environment config", () => {
	it("uses us-east-2 for dev", () => {
		const app = new App({ context: { appEnv: "dev" } });
		const config = getEnvironmentConfig(app);

		expect(config.appEnv).toBe("dev");
		expect(config.region).toBe("us-east-2");
		expect(config.autoDeleteObjects).toBe(true);
	});

	it("uses us-east-1 and retained stateful resources for prod", () => {
		const app = new App({ context: { appEnv: "prod" } });
		const config = getEnvironmentConfig(app);

		expect(config.appEnv).toBe("prod");
		expect(config.region).toBe("us-east-1");
		expect(config.autoDeleteObjects).toBe(false);
	});
});
