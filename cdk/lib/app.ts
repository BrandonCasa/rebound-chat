import type { App } from "aws-cdk-lib";

import type { ReboundEnvironmentConfig } from "./config";
import { ApiStack } from "./api-stack";
import { ComputeStack } from "./compute-stack";
import { DataStack } from "./data-stack";
import { FrontendStack } from "./frontend-stack";
import { NetworkStack } from "./network-stack";
import { PipelineStack } from "./pipeline-stack";

const stackPrefix = (appEnv: string) => `Rebound-${appEnv}`;

export const createReboundStacks = (app: App, config: ReboundEnvironmentConfig) => {
	const env = {
		account: config.account,
		region: config.region,
	};
	const prefix = stackPrefix(config.appEnv);

	const network = new NetworkStack(app, `${prefix}-Network`, {
		env,
		config,
	});

	const data = new DataStack(app, `${prefix}-Data`, {
		env,
		config,
		vpc: network.vpc,
		appSecurityGroup: network.appSecurityGroup,
	});

	const api = new ApiStack(app, `${prefix}-Api`, {
		env,
		config,
	});

	const frontend = new FrontendStack(app, `${prefix}-Frontend`, {
		env,
		config,
	});

	const compute = new ComputeStack(app, `${prefix}-Compute`, {
		env,
		config,
		vpc: network.vpc,
		appSecurityGroup: network.appSecurityGroup,
		liveKitSecurityGroup: network.liveKitSecurityGroup,
		database: data.database,
		mediaBucket: data.mediaBucket,
		liveBucket: data.liveBucket,
		websocketConnectionTable: data.websocketConnectionTable,
		websocketApi: api.websocketApi,
	});

	const pipeline = new PipelineStack(app, `${prefix}-Pipeline`, {
		env,
		config,
		repositories: compute.repositories,
		frontendBucket: frontend.assetBucket,
		distribution: frontend.distribution,
	});

	return {
		network,
		data,
		compute,
		api,
		frontend,
		pipeline,
	};
};
