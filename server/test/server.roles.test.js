import { expect } from "chai";

import { ECS_SMOKE_MODE_ENV, ServerBackend, resolveEcsSmokeMode, resolveServerRole } from "../src/app.js";
import { getWorkerHealth } from "../src/worker/health.js";

const createDependencies = () => {
	const calls = {
		cleanupStart: 0,
		cleanupStop: 0,
		databaseStart: 0,
		databaseStop: 0,
		socketStart: 0,
		socketPort: null,
	};

	const socketBackend = {
		io: null,
		start(port) {
			calls.socketStart += 1;
			calls.socketPort = port;
			this.io = {
				close(callback) {
					callback();
				},
			};
		},
	};

	return {
		calls,
		liveRuntime: {
			start() {
				calls.cleanupStart += 1;
			},
			stop() {
				calls.cleanupStop += 1;
			},
		},
		databaseServer: {
			async startServer() {
				calls.databaseStart += 1;
			},
			async stopServer() {
				calls.databaseStop += 1;
			},
		},
		socketBackend,
	};
};

describe("server role selection", () => {
	it("defaults invalid or missing roles to combined", () => {
		expect(resolveServerRole()).to.equal("combined");
		expect(resolveServerRole("invalid")).to.equal("combined");
		expect(resolveServerRole("API")).to.equal("api");
	});

	it("keeps ECS smoke mode explicit and dev-only", () => {
		expect(resolveEcsSmokeMode({ APP_ENV: "dev", [ECS_SMOKE_MODE_ENV]: "true" })).to.equal(true);
		expect(resolveEcsSmokeMode({ APP_ENV: "dev", [ECS_SMOKE_MODE_ENV]: "0" })).to.equal(false);
		expect(() => resolveEcsSmokeMode({ APP_ENV: "prod", [ECS_SMOKE_MODE_ENV]: "true" })).to.throw(/APP_ENV=dev/);
		expect(() => resolveEcsSmokeMode({ APP_ENV: "dev", [ECS_SMOKE_MODE_ENV]: "maybe" })).to.throw(/Invalid/);
	});

	it("starts API mode with HTTP but without Socket.IO or live cleanup", async () => {
		const deps = createDependencies();
		const backend = new ServerBackend({ role: "api", ...deps });

		await backend.startBackend({ httpPort: 0, startSockets: true });

		const address = backend.server.address();
		const response = await fetch(`http://127.0.0.1:${address.port}/healthz`);
		const body = await response.json();

		expect(response.status).to.equal(200);
		expect(body.role).to.equal("api");
		expect(deps.calls.databaseStart).to.equal(1);
		expect(deps.calls.cleanupStart).to.equal(0);
		expect(deps.calls.socketStart).to.equal(0);

		await backend.stopBackend();
	});

	it("starts API ECS smoke mode without Mongo or product worker startup", async () => {
		const deps = createDependencies();
		const backend = new ServerBackend({
			role: "api",
			env: { APP_ENV: "dev", [ECS_SMOKE_MODE_ENV]: "1" },
			...deps,
		});

		await backend.startBackend({ httpPort: 0, startSockets: true });

		const address = backend.server.address();
		const response = await fetch(`http://127.0.0.1:${address.port}/healthz`);
		const body = await response.json();

		expect(response.status).to.equal(200);
		expect(body.role).to.equal("api");
		expect(body.mode).to.equal("ecs-smoke");
		expect(deps.calls.databaseStart).to.equal(0);
		expect(deps.calls.cleanupStart).to.equal(0);
		expect(deps.calls.socketStart).to.equal(0);

		await backend.stopBackend();
	});

	it("starts worker mode with live cleanup and no product HTTP listener", async () => {
		const deps = createDependencies();
		const backend = new ServerBackend({ role: "worker", ...deps });

		await backend.startBackend({ httpPort: 0, startSockets: true });

		expect(backend.server.listening).to.equal(false);
		expect(deps.calls.databaseStart).to.equal(1);
		expect(deps.calls.cleanupStart).to.equal(1);
		expect(deps.calls.socketStart).to.equal(0);

		await backend.stopBackend();

		expect(deps.calls.cleanupStop).to.equal(1);
		expect(deps.calls.databaseStop).to.equal(1);
	});

	it("starts worker ECS smoke mode without Mongo or live cleanup and stays alive for ECS", async () => {
		const deps = createDependencies();
		const backend = new ServerBackend({
			role: "worker",
			env: { APP_ENV: "dev", [ECS_SMOKE_MODE_ENV]: "1" },
			...deps,
		});

		await backend.startBackend({ httpPort: 0, startSockets: true });

		expect(backend.server.listening).to.equal(false);
		expect(backend.smokeKeepAliveTimer).to.not.equal(null);
		expect(deps.calls.databaseStart).to.equal(0);
		expect(deps.calls.cleanupStart).to.equal(0);
		expect(deps.calls.socketStart).to.equal(0);

		await backend.stopBackend();

		expect(backend.smokeKeepAliveTimer).to.equal(null);
		expect(deps.calls.cleanupStop).to.equal(0);
		expect(deps.calls.databaseStop).to.equal(0);
	});

	it("reports worker ECS smoke health only for dev app environments", () => {
		expect(getWorkerHealth({ APP_ENV: "dev", SERVER_ROLE: "worker", [ECS_SMOKE_MODE_ENV]: "1" })).to.deep.include({
			status: "ok",
			role: "worker",
			mode: "ecs-smoke",
		});
		expect(getWorkerHealth({ APP_ENV: "prod", SERVER_ROLE: "worker", [ECS_SMOKE_MODE_ENV]: "1" }).status).to.equal("degraded");
	});

	it("preserves combined mode ownership of HTTP, Socket.IO, and live cleanup", async () => {
		const deps = createDependencies();
		const backend = new ServerBackend({ role: "combined", ...deps });

		await backend.startBackend({ httpPort: 0, startSockets: true });

		expect(backend.server.listening).to.equal(true);
		expect(deps.calls.databaseStart).to.equal(1);
		expect(deps.calls.cleanupStart).to.equal(1);
		expect(deps.calls.socketStart).to.equal(1);

		await backend.stopBackend();
	});

	it("starts realtime mode as a non-Socket.IO stub without HTTP", async () => {
		const deps = createDependencies();
		const backend = new ServerBackend({ role: "realtime", ...deps });

		await backend.startBackend({ httpPort: 0, startSockets: true });

		expect(backend.server.listening).to.equal(false);
		expect(backend.realtimeStubTimer).to.not.equal(null);
		expect(deps.calls.databaseStart).to.equal(0);
		expect(deps.calls.cleanupStart).to.equal(0);
		expect(deps.calls.socketStart).to.equal(0);

		await backend.stopBackend();
	});
});
