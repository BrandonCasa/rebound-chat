import { expect } from "chai";

import { ServerBackend, resolveServerRole } from "../src/app.js";

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
