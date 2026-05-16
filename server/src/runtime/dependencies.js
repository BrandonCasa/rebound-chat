import databaseServer from "../database/index.js";

const CUTOVER_ROLES = new Set(["api", "worker"]);

const resolveAppEnv = (env = process.env) =>
	String(env.APP_ENV || env.NODE_ENV || "")
		.trim()
		.toLowerCase();

const isDevCutoverRole = ({ role, env = process.env } = {}) => resolveAppEnv(env) === "dev" && CUTOVER_ROLES.has(String(role || "").toLowerCase());

const buildDependencyHealth = ({ role, env = process.env, database = databaseServer } = {}) => {
	const normalizedRole = String(role || "combined").toLowerCase();
	const devCutover = isDevCutoverRole({ role: normalizedRole, env });
	const mongoRequired = normalizedRole === "combined";
	const auroraRequired = devCutover;
	const s3Required = devCutover;

	const checks = {
		mongo: {
			required: mongoRequired,
			ready: database.isReady(),
		},
		aurora: {
			required: auroraRequired,
			configured: Boolean(env.DATABASE_URL),
		},
		s3Live: {
			required: s3Required,
			configured: Boolean(env.S3_LIVE_BUCKET || env.LIVE_S3_BUCKET),
		},
		s3Media: {
			required: s3Required,
			configured: Boolean(env.S3_MEDIA_BUCKET),
		},
	};

	const requiredChecksPassing = Object.values(checks).every((check) => {
		if (!check.required) return true;
		if ("ready" in check) return check.ready;
		return check.configured;
	});

	return {
		status: requiredChecksPassing ? "ok" : "degraded",
		role: normalizedRole,
		mode: devCutover ? "dev-cutover" : "runtime",
		checks,
	};
};

export { buildDependencyHealth, isDevCutoverRole, resolveAppEnv };
