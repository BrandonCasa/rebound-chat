import { RemovalPolicy } from "aws-cdk-lib";
import type { App } from "aws-cdk-lib";

export type AppEnvironment = "dev" | "prod";

export interface ImageTagOverrides {
	api?: string;
	realtime?: string;
	worker?: string;
	livekit?: string;
}

export interface ServiceDesiredCounts {
	api?: number;
	realtime?: number;
	worker?: number;
	livekit?: number;
}

export interface ReboundEnvironmentConfig {
	appEnv: AppEnvironment;
	account?: string;
	region: string;
	domainName: string;
	githubOwner: string;
	githubRepo: string;
	natGateways: number;
	auroraMinAcu: number;
	auroraMaxAcu: number;
	liveKitImage: string;
	imageTags?: ImageTagOverrides;
	serviceDesiredCounts: Required<ServiceDesiredCounts>;
	codeBuildDryRun: boolean;
	runtimeSmokeMode: boolean;
	removalPolicy: RemovalPolicy;
	autoDeleteObjects: boolean;
}

interface RawEnvironmentConfig {
	account?: string;
	region?: string;
	domainName?: string;
	githubOwner?: string;
	githubRepo?: string;
	natGateways?: number;
	auroraMinAcu?: number;
	auroraMaxAcu?: number;
	liveKitImage?: string;
	serviceDesiredCounts?: ServiceDesiredCounts;
	codeBuildDryRun?: boolean;
	runtimeSmokeMode?: boolean;
}

type EnvironmentDefaults = Required<Omit<RawEnvironmentConfig, "account" | "serviceDesiredCounts" | "codeBuildDryRun" | "runtimeSmokeMode">>;

const defaults: Record<AppEnvironment, EnvironmentDefaults> = {
	dev: {
		region: "us-east-2",
		domainName: "dev.rebound.nexus",
		githubOwner: "BrandonCasa",
		githubRepo: "rebound-chat",
		natGateways: 1,
		auroraMinAcu: 0.5,
		auroraMaxAcu: 2,
		liveKitImage: "livekit/livekit-server:v1.9",
	},
	prod: {
		region: "us-east-1",
		domainName: "rebound.nexus",
		githubOwner: "BrandonCasa",
		githubRepo: "rebound-chat",
		natGateways: 2,
		auroraMinAcu: 1,
		auroraMaxAcu: 8,
		liveKitImage: "livekit/livekit-server:v1.9",
	},
};

const isAppEnvironment = (value: unknown): value is AppEnvironment => value === "dev" || value === "prod";
const serviceNames = ["api", "realtime", "worker", "livekit"] as const;

const defaultServiceDesiredCounts: Required<ServiceDesiredCounts> = {
	api: 0,
	realtime: 0,
	worker: 0,
	livekit: 0,
};

const parseBoolean = (value: unknown, key: string): boolean | undefined => {
	if (value === undefined) {
		return undefined;
	}

	if (typeof value === "boolean") {
		return value;
	}

	if (typeof value === "string") {
		const normalized = value.trim().toLowerCase();
		if (["1", "true", "yes"].includes(normalized)) {
			return true;
		}
		if (["0", "false", "no"].includes(normalized)) {
			return false;
		}
	}

	throw new Error(`Invalid ${key} context. Expected a boolean value.`);
};

const parseImageTags = (value: unknown): ImageTagOverrides | undefined => {
	let parsed: unknown = value;

	if (typeof value === "string") {
		try {
			parsed = JSON.parse(value);
		} catch {
			throw new Error("Invalid imageTags context. Expected a JSON object.");
		}
	}

	if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
		return undefined;
	}

	const imageTags: ImageTagOverrides = {};
	for (const key of ["api", "realtime", "worker", "livekit"] as const) {
		const candidate = (parsed as Record<string, unknown>)[key];
		if (typeof candidate === "string" && candidate.trim().length > 0) {
			imageTags[key] = candidate.trim();
		}
	}

	return Object.keys(imageTags).length > 0 ? imageTags : undefined;
};

const parseDesiredCount = (value: unknown, key: string): number | undefined => {
	if (value === undefined || value === null || value === "") {
		return undefined;
	}

	const parsed = typeof value === "number" ? value : Number(value);
	if (!Number.isInteger(parsed) || parsed < 0) {
		throw new Error(`Invalid ${key} context. Expected a non-negative integer.`);
	}

	return parsed;
};

const parseServiceDesiredCounts = (value: unknown): ServiceDesiredCounts | undefined => {
	let parsed: unknown = value;

	if (typeof value === "string") {
		try {
			parsed = JSON.parse(value);
		} catch {
			throw new Error("Invalid serviceDesiredCounts context. Expected a JSON object.");
		}
	}

	if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
		return undefined;
	}

	const desiredCounts: ServiceDesiredCounts = {};
	for (const key of serviceNames) {
		const desiredCount = parseDesiredCount((parsed as Record<string, unknown>)[key], `serviceDesiredCounts.${key}`);
		if (desiredCount !== undefined) {
			desiredCounts[key] = desiredCount;
		}
	}

	return Object.keys(desiredCounts).length > 0 ? desiredCounts : undefined;
};

const parseImageTagsFromFlatContext = (app: App): ImageTagOverrides | undefined => {
	const imageTags: ImageTagOverrides = {};
	for (const key of ["api", "realtime", "worker", "livekit"] as const) {
		const candidate = app.node.tryGetContext(`imageTags.${key}`);
		if (typeof candidate === "string" && candidate.trim().length > 0) {
			imageTags[key] = candidate.trim();
		}
	}

	return Object.keys(imageTags).length > 0 ? imageTags : undefined;
};

const parseServiceDesiredCountsFromFlatContext = (app: App): ServiceDesiredCounts | undefined => {
	const desiredCounts: ServiceDesiredCounts = {};
	for (const key of serviceNames) {
		const desiredCount = parseDesiredCount(app.node.tryGetContext(`serviceDesiredCounts.${key}`), `serviceDesiredCounts.${key}`);
		if (desiredCount !== undefined) {
			desiredCounts[key] = desiredCount;
		}
	}

	return Object.keys(desiredCounts).length > 0 ? desiredCounts : undefined;
};

export const getEnvironmentConfig = (app: App): ReboundEnvironmentConfig => {
	const requested = app.node.tryGetContext("appEnv") || app.node.tryGetContext("env") || process.env.APP_ENV || "dev";

	if (!isAppEnvironment(requested)) {
		throw new Error(`Unsupported appEnv '${requested}'. Expected 'dev' or 'prod'.`);
	}

	const environments = (app.node.tryGetContext("environments") || {}) as Record<string, RawEnvironmentConfig>;
	const contextConfig = environments[requested] || {};
	const imageTags = parseImageTags(app.node.tryGetContext("imageTags")) ?? parseImageTagsFromFlatContext(app);
	const serviceDesiredCounts = {
		...defaultServiceDesiredCounts,
		...parseServiceDesiredCounts(contextConfig.serviceDesiredCounts),
		...parseServiceDesiredCounts(app.node.tryGetContext("serviceDesiredCounts")),
		...parseServiceDesiredCountsFromFlatContext(app),
	};
	const codeBuildDryRun =
		parseBoolean(app.node.tryGetContext("codeBuildDryRun"), "codeBuildDryRun") ??
		parseBoolean(contextConfig.codeBuildDryRun, "codeBuildDryRun") ??
		true;
	const runtimeSmokeMode =
		parseBoolean(app.node.tryGetContext("runtimeSmokeMode"), "runtimeSmokeMode") ??
		parseBoolean(contextConfig.runtimeSmokeMode, "runtimeSmokeMode") ??
		false;
	if (runtimeSmokeMode && requested !== "dev") {
		throw new Error("runtimeSmokeMode can only be enabled for appEnv=dev.");
	}
	const merged = {
		...defaults[requested],
		...contextConfig,
	};

	return {
		appEnv: requested,
		account: contextConfig.account,
		region: merged.region,
		domainName: merged.domainName,
		githubOwner: merged.githubOwner,
		githubRepo: merged.githubRepo,
		natGateways: merged.natGateways,
		auroraMinAcu: merged.auroraMinAcu,
		auroraMaxAcu: merged.auroraMaxAcu,
		liveKitImage: merged.liveKitImage,
		imageTags,
		serviceDesiredCounts,
		codeBuildDryRun,
		runtimeSmokeMode,
		removalPolicy: requested === "prod" ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
		autoDeleteObjects: requested !== "prod",
	};
};
