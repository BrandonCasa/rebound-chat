import { expect, test as base } from "@playwright/test";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");
const serverRoot = path.join(repoRoot, "server");

const STARTUP_TIMEOUT_MS = 120_000;
const PORT_BLOCK_SIZE = 6;

const portBase = {
	web: Number(process.env.PW_E2E_WEB_PORT_BASE || 3100),
	rest: Number(process.env.PW_E2E_REST_PORT_BASE || 3101),
	socket: Number(process.env.PW_E2E_SOCKET_PORT_BASE || 3102),
	mongo: Number(process.env.PW_E2E_MONGO_PORT_BASE || 3103),
};

const sanitizeSegment = (value) =>
	String(value)
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 80) || "test";

const isPortAvailable = (port) =>
	new Promise((resolve) => {
		const probe = net.createServer();

		probe.once("error", () => resolve(false));
		probe.once("listening", () => {
			probe.close(() => resolve(true));
		});

		probe.listen(port, "127.0.0.1");
	});

const findPort = async (startPort) => {
	for (let port = startPort; port < startPort + PORT_BLOCK_SIZE; port += 1) {
		if (await isPortAvailable(port)) return port;
	}

	throw new Error(`No available port found from ${startPort} to ${startPort + PORT_BLOCK_SIZE - 1}`);
};

const waitForHttp = async (url, processHandle, timeoutMs = STARTUP_TIMEOUT_MS) => {
	const startedAt = Date.now();

	while (Date.now() - startedAt < timeoutMs) {
		if (processHandle.exitCode !== null) {
			throw new Error(`Process exited before ${url} became available`);
		}

		const ok = await new Promise((resolve) => {
			const req = http.get(url, (res) => {
				res.resume();
				resolve(res.statusCode >= 200 && res.statusCode < 500);
			});

			req.once("error", () => resolve(false));
			req.setTimeout(1000, () => {
				req.destroy();
				resolve(false);
			});
		});

		if (ok) return;
		await new Promise((resolve) => setTimeout(resolve, 500));
	}

	throw new Error(`Timed out waiting for ${url}`);
};

const writeProcessOutput = (child, logPath) => {
	const append = async (chunk) => {
		try {
			await fs.appendFile(logPath, chunk);
		} catch (_err) {
			// Preserve the child process even if artifact logging fails.
		}
	};

	child.stdout?.on("data", append);
	child.stderr?.on("data", append);
};

const waitForExit = (child, timeoutMs) =>
	new Promise((resolve) => {
		if (child.exitCode !== null) return resolve();

		const timer = setTimeout(resolve, timeoutMs);
		child.once("exit", () => {
			clearTimeout(timer);
			resolve();
		});
	});

const killWindowsProcessTree = async (pid) => {
	const killer = spawn("taskkill", ["/pid", String(pid), "/T", "/F"], {
		stdio: "ignore",
		windowsHide: true,
	});

	await waitForExit(killer, 5000);
};

const stopProcess = async (child) => {
	if (!child || child.exitCode !== null) return;

	if (process.platform === "win32") {
		await killWindowsProcessTree(child.pid);
		await waitForExit(child, 5000);
		return;
	}

	child.kill("SIGTERM");
	await waitForExit(child, 10_000);

	if (child.exitCode === null) {
		child.kill("SIGKILL");
	}
};

const removeDirectory = async (directory, { throwOnFailure = false } = {}) => {
	let lastError = null;

	for (let attempt = 0; attempt < 8; attempt += 1) {
		try {
			await fs.rm(directory, { recursive: true, force: true });
			return;
		} catch (err) {
			lastError = err;
			await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
		}
	}

	if (throwOnFailure) throw lastError;
	console.warn(`Unable to remove ${directory}: ${lastError?.message || lastError}`);
};

const startProcess = async ({ command, args, cwd, env, logPath }) => {
	await fs.mkdir(path.dirname(logPath), { recursive: true });
	await fs.writeFile(logPath, "");

	const child = spawn(command, args, {
		cwd,
		env,
		stdio: ["ignore", "pipe", "pipe"],
		windowsHide: true,
	});

	writeProcessOutput(child, logPath);
	return child;
};

const createTestRunPaths = async (testInfo) => {
	const titlePath = Array.isArray(testInfo.titlePath) ? testInfo.titlePath : [path.basename(testInfo.file), testInfo.title];
	const titleSlug = sanitizeSegment(titlePath.join("-"));
	const runSlug = sanitizeSegment(`${testInfo.project.name}-${testInfo.workerIndex}-${testInfo.retry}-${titleSlug}`);
	const serverRunDir = path.join(serverRoot, "dev-e2e", runSlug);
	const artifactDir = testInfo.outputPath("servers");

	await removeDirectory(serverRunDir, { throwOnFailure: true });
	await fs.mkdir(serverRunDir, { recursive: true });
	await fs.mkdir(artifactDir, { recursive: true });

	return {
		serverRunDir,
		mongoDir: path.join(serverRunDir, "mongo"),
		liveStorageDir: path.join(serverRunDir, "live-storage"),
		winstonLogDir: path.join(artifactDir, "server-winston"),
		serverProcessLog: path.join(artifactDir, "server-process.log"),
		webProcessLog: path.join(artifactDir, "web-process.log"),
	};
};

const allocatePorts = async (testInfo) => {
	const offset = testInfo.workerIndex * PORT_BLOCK_SIZE;

	return {
		web: await findPort(portBase.web + offset),
		rest: await findPort(portBase.rest + offset),
		socket: await findPort(portBase.socket + offset),
		mongo: await findPort(portBase.mongo + offset),
	};
};

const startE2eStack = async (testInfo) => {
	const ports = await allocatePorts(testInfo);
	const paths = await createTestRunPaths(testInfo);

	const serverProcess = await startProcess({
		command: process.execPath,
		args: ["./src/app.js"],
		cwd: serverRoot,
		logPath: paths.serverProcessLog,
		env: {
			...process.env,
			NODE_ENV: "development",
			PORT: String(ports.rest),
			REBOUND_SOCKET_PORT: String(ports.socket),
			MONGOMS_PORT: String(ports.mongo),
			REBOUND_DEV_DB_PATH: paths.mongoDir,
			REBOUND_RESET_DEV_DB: "1",
			REBOUND_LOG_DIR: paths.winstonLogDir,
			LIVE_STORAGE_DIR: paths.liveStorageDir,
			LIVE_INGEST_CREATE_TOKEN: process.env.LIVE_INGEST_CREATE_TOKEN || "test-live-create-token",
			ACCESS_TOKEN_SECRET: process.env.ACCESS_TOKEN_SECRET || "playwright-access-secret",
			REFRESH_TOKEN_SECRET: process.env.REFRESH_TOKEN_SECRET || "playwright-refresh-secret",
		},
	});

	try {
		await waitForHttp(`http://127.0.0.1:${ports.rest}/api/csrf`, serverProcess);

		const webProcess = await startProcess({
			command: process.execPath,
			args: [path.join(repoRoot, "node_modules", "vite", "bin", "vite.js"), "--host", "127.0.0.1", "--port", String(ports.web), "--strictPort"],
			cwd: repoRoot,
			logPath: paths.webProcessLog,
			env: {
				...process.env,
				VITE_API_PROXY_TARGET: `http://127.0.0.1:${ports.rest}`,
				VITE_SOCKET_URL: `http://127.0.0.1:${ports.socket}`,
				VITE_LIVE_CONTROL_ORIGIN: `http://127.0.0.1:${ports.socket}`,
			},
		});

		try {
			await waitForHttp(`http://127.0.0.1:${ports.web}/`, webProcess);
		} catch (err) {
			await stopProcess(webProcess);
			throw err;
		}

		return {
			ports,
			paths,
			webBaseUrl: `http://127.0.0.1:${ports.web}`,
			serverProcess,
			webProcess,
		};
	} catch (err) {
		await stopProcess(serverProcess);
		throw err;
	}
};

const stopE2eStack = async (stack) => {
	await stopProcess(stack.webProcess);
	await stopProcess(stack.serverProcess);
	await removeDirectory(stack.paths.serverRunDir);
};

const test = base.extend({
	e2eStack: async ({}, use, testInfo) => {
		const stack = await startE2eStack(testInfo);

		try {
			await use(stack);
		} finally {
			await stopE2eStack(stack);
		}
	},
	baseURL: async ({ e2eStack }, use) => {
		await use(e2eStack.webBaseUrl);
	},
});

export { expect, test };
