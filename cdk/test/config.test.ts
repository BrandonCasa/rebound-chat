import { App } from "aws-cdk-lib";
import { describe, expect, it } from "vitest";

import { getEnvironmentConfig } from "../lib/config";

describe("environment config", () => {
	it("uses us-east-2 for dev", () => {
		const app = new App({ context: { appEnv: "dev" } });
		const config = getEnvironmentConfig(app);

		expect(config.appEnv).toBe("dev");
		expect(config.region).toBe("us-east-2");
		expect(config.serviceDesiredCounts).toEqual({
			api: 0,
			realtime: 0,
			worker: 0,
			livekit: 0,
		});
		expect(config.codeBuildDryRun).toBe(true);
		expect(config.runtimeSmokeMode).toBe(false);
		expect(config.autoDeleteObjects).toBe(true);
	});

	it("uses us-east-1 and retained stateful resources for prod", () => {
		const app = new App({ context: { appEnv: "prod" } });
		const config = getEnvironmentConfig(app);

		expect(config.appEnv).toBe("prod");
		expect(config.region).toBe("us-east-1");
		expect(config.autoDeleteObjects).toBe(false);
	});

	it("accepts Plan D deploy context overrides", () => {
		const app = new App({
			context: {
				appEnv: "dev",
				codeBuildDryRun: "false",
				runtimeSmokeMode: "true",
				"serviceDesiredCounts.api": "1",
				"serviceDesiredCounts.worker": 1,
			},
		});
		const config = getEnvironmentConfig(app);

		expect(config.codeBuildDryRun).toBe(false);
		expect(config.runtimeSmokeMode).toBe(true);
		expect(config.serviceDesiredCounts).toEqual({
			api: 1,
			realtime: 0,
			worker: 1,
			livekit: 0,
		});
	});

	it("rejects runtime smoke mode outside dev", () => {
		const app = new App({ context: { appEnv: "prod", runtimeSmokeMode: "true" } });

		expect(() => getEnvironmentConfig(app)).toThrow(/appEnv=dev/);
	});
});
