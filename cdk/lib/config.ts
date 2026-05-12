import { RemovalPolicy } from "aws-cdk-lib";
import type { App } from "aws-cdk-lib";

export type AppEnvironment = "dev" | "prod";

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
		githubRepo: "rebound-electron",
		natGateways: 1,
		auroraMinAcu: 0.5,
		auroraMaxAcu: 2,
		liveKitImage: "livekit/livekit-server:v1.9",
	},
	prod: {
		region: "us-east-1",
		domainName: "rebound.nexus",
		githubOwner: "BrandonCasa",
		githubRepo: "rebound-electron",
		natGateways: 2,
		auroraMinAcu: 1,
		auroraMaxAcu: 8,
		liveKitImage: "livekit/livekit-server:v1.9",
	},
};

const isAppEnvironment = (value: unknown): value is AppEnvironment => value === "dev" || value === "prod";

export const getEnvironmentConfig = (app: App): ReboundEnvironmentConfig => {
	const requested = app.node.tryGetContext("appEnv") || app.node.tryGetContext("env") || process.env.APP_ENV || "dev";

	if (!isAppEnvironment(requested)) {
		throw new Error(`Unsupported appEnv '${requested}'. Expected 'dev' or 'prod'.`);
	}

	const environments = (app.node.tryGetContext("environments") || {}) as Record<string, RawEnvironmentConfig>;
	const contextConfig = environments[requested] || {};
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
		removalPolicy: requested === "prod" ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
		autoDeleteObjects: requested !== "prod",
	};
};
