import { aws_ssm as ssm } from "aws-cdk-lib";
import type { Construct } from "constructs";

import type { AppEnvironment, ReboundEnvironmentConfig } from "./config";

export type RuntimeParameterKey =
	| "databaseUrl"
	| "databaseHost"
	| "databasePort"
	| "databaseName"
	| "databaseCredentialsSecretArn"
	| "storageMediaBucket"
	| "storageLiveBucket"
	| "liveKitUrl"
	| "liveKitApiKey"
	| "liveKitApiSecret"
	| "liveKitWebhookSecret"
	| "deployGitHubActionsRoleArn";

export type RuntimeParameterNames = Record<RuntimeParameterKey, string>;

export const runtimeParameterNames = (appEnv: AppEnvironment): RuntimeParameterNames => ({
	databaseUrl: `/rebound/${appEnv}/database/url`,
	databaseHost: `/rebound/${appEnv}/database/host`,
	databasePort: `/rebound/${appEnv}/database/port`,
	databaseName: `/rebound/${appEnv}/database/name`,
	databaseCredentialsSecretArn: `/rebound/${appEnv}/database/credentials-secret-arn`,
	storageMediaBucket: `/rebound/${appEnv}/storage/media-bucket`,
	storageLiveBucket: `/rebound/${appEnv}/storage/live-bucket`,
	liveKitUrl: `/rebound/${appEnv}/livekit/url`,
	liveKitApiKey: `/rebound/${appEnv}/livekit/api-key`,
	liveKitApiSecret: `/rebound/${appEnv}/livekit/api-secret`,
	liveKitWebhookSecret: `/rebound/${appEnv}/livekit/webhook-secret`,
	deployGitHubActionsRoleArn: `/rebound/${appEnv}/deploy/github-actions-role-arn`,
});

export type RuntimeParameters = Partial<Record<RuntimeParameterKey, ssm.IStringParameter>>;

export const createRuntimeParameter = (
	scope: Construct,
	id: string,
	config: ReboundEnvironmentConfig,
	name: string,
	value: string
) =>
	new ssm.StringParameter(scope, id, {
		parameterName: name,
		stringValue: value,
		tier: ssm.ParameterTier.STANDARD,
		description: `Rebound ${config.appEnv} runtime configuration: ${name}`,
	});

