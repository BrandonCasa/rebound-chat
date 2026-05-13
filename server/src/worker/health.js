import { pathToFileURL } from "node:url";

const cleanupOwnerRoles = new Set(["worker", "combined"]);
const truthyEnvValues = new Set(["1", "true", "yes"]);

const isEcsSmokeModeEnabled = (env = process.env) =>
	truthyEnvValues.has(
		String(env.REBOUND_ECS_SMOKE_MODE || "")
			.trim()
			.toLowerCase()
	);

const getWorkerHealth = (env = process.env) => {
	const role = String(env.SERVER_ROLE || "combined").toLowerCase();
	const ownsCleanup = cleanupOwnerRoles.has(role);
	const ecsSmokeMode = isEcsSmokeModeEnabled(env);
	const appEnv = String(env.APP_ENV || "")
		.trim()
		.toLowerCase();
	const smokeModeAllowed = !ecsSmokeMode || appEnv === "dev";

	return {
		status: ownsCleanup && smokeModeAllowed ? "ok" : "degraded",
		role,
		mode: ecsSmokeMode ? "ecs-smoke" : "runtime",
		checks: {
			liveCleanupOwner: ownsCleanup,
			ecsSmokeModeDevOnly: smokeModeAllowed,
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
