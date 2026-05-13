import { RemovalPolicy } from "aws-cdk-lib";
import type { App } from "aws-cdk-lib";

export type AppEnvironment = "dev" | "prod";

export interface ImageTagOverrides {
	api?: string;
	realtime?: string;
	worker?: string;
	livekit?: string;
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
}

const defaults: Record<AppEnvironment, Required<Omit<RawEnvironmentConfig, "account">>> = {
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

export const getEnvironmentConfig = (app: App): ReboundEnvironmentConfig => {
	const requested = app.node.tryGetContext("appEnv") || app.node.tryGetContext("env") || process.env.APP_ENV || "dev";

	if (!isAppEnvironment(requested)) {
		throw new Error(`Unsupported appEnv '${requested}'. Expected 'dev' or 'prod'.`);
	}

	const environments = (app.node.tryGetContext("environments") || {}) as Record<string, RawEnvironmentConfig>;
	const contextConfig = environments[requested] || {};
	const imageTags = parseImageTags(app.node.tryGetContext("imageTags")) ?? parseImageTagsFromFlatContext(app);
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
		removalPolicy: requested === "prod" ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
		autoDeleteObjects: requested !== "prod",
	};
};
