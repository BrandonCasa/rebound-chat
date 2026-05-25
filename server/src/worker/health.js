import { pathToFileURL } from "node:url";

const cleanupOwnerRoles = new Set(["worker", "combined"]);

const getWorkerHealth = (env = process.env) => {
	const role = String(env.SERVER_ROLE || "combined").toLowerCase();
	const ownsCleanup = cleanupOwnerRoles.has(role);

	return {
		status: ownsCleanup ? "ok" : "degraded",
		role,
		checks: {
			liveCleanupOwner: ownsCleanup,
		},
	};
};

const runCli = () => {
	const health = getWorkerHealth();
	console.log(JSON.stringify(health));
	process.exitCode = health.status === "ok" ? 0 : 1;
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	runCli();
}

export { getWorkerHealth };
