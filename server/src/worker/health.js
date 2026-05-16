import { pathToFileURL } from "node:url";

import { buildDependencyHealth, resolveAppEnv } from "../runtime/dependencies.js";

const cleanupOwnerRoles = new Set(["worker", "combined"]);

const getWorkerHealth = (env = process.env) => {
	const role = String(env.SERVER_ROLE || "combined").toLowerCase();
	const ownsCleanup = cleanupOwnerRoles.has(role);
	const dependencyHealth = buildDependencyHealth({ role, env });
	const ecsSmokeMode =
		String(env.REBOUND_ECS_SMOKE_MODE || "")
			.trim()
			.toLowerCase() === "1";
	const smokeModeAllowed = !ecsSmokeMode || resolveAppEnv(env) === "dev";
	const status = ecsSmokeMode
		? ownsCleanup && smokeModeAllowed
			? "ok"
			: "degraded"
		: ownsCleanup && smokeModeAllowed && dependencyHealth.status === "ok"
			? "ok"
			: "degraded";

	return {
		status,
		role,
		mode: ecsSmokeMode ? "ecs-smoke" : dependencyHealth.mode,
		checks: {
			liveCleanupOwner: ownsCleanup,
			ecsSmokeModeDevOnly: smokeModeAllowed,
			...dependencyHealth.checks,
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
