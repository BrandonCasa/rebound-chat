import { App } from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { describe, expect, it } from "vitest";

import { createReboundStacks } from "../lib/app";
import { getEnvironmentConfig } from "../lib/config";

const synthStacks = (appEnv = "dev", extraContext: Record<string, unknown> = {}) => {
	const app = new App({ context: { appEnv, ...extraContext } });
	const config = getEnvironmentConfig(app);
	return createReboundStacks(app, config);
};

const getTaskDefinitionForRole = (template: Template, role: string) => {
	const taskDefinitions = template.findResources("AWS::ECS::TaskDefinition");
	for (const taskDefinition of Object.values(taskDefinitions)) {
		const container = taskDefinition.Properties.ContainerDefinitions?.[0];
		const envVars = container?.Environment ?? [];
		if (envVars.some((entry: { Name: string; Value: string }) => entry.Name === "SERVER_ROLE" && entry.Value === role)) {
			return taskDefinition;
		}
	}
	return undefined;
};

describe("rebound aws stacks", () => {
	it("creates network, data, compute, api, frontend, and pipeline foundations", () => {
		const stacks = synthStacks();

		Template.fromStack(stacks.network).resourceCountIs("AWS::EC2::VPC", 1);
		Template.fromStack(stacks.data).resourceCountIs("AWS::RDS::DBCluster", 1);
		Template.fromStack(stacks.data).resourceCountIs("AWS::DynamoDB::Table", 1);
		Template.fromStack(stacks.compute).resourceCountIs("AWS::ECR::Repository", 5);
		Template.fromStack(stacks.compute).resourceCountIs("AWS::ECS::Service", 4);
		Template.fromStack(stacks.api).resourceCountIs("AWS::ApiGatewayV2::Api", 2);
		Template.fromStack(stacks.frontend).resourceCountIs("AWS::CloudFront::Distribution", 1);
		Template.fromStack(stacks.pipeline).resourceCountIs("AWS::CodeBuild::Project", 4);
	});

	it("uses us-east-2 for dev stacks by default", () => {
		const stacks = synthStacks("dev");

		expect(stacks.network.region).toBe("us-east-2");
		expect(stacks.data.region).toBe("us-east-2");
		expect(stacks.compute.region).toBe("us-east-2");
	});

	it("publishes key service discovery outputs", () => {
		const stacks = synthStacks();

		Template.fromStack(stacks.network).hasOutput("VpcId", {});
		Template.fromStack(stacks.network).hasOutput("PrivateSubnetIds", {});
		Template.fromStack(stacks.data).hasOutput("MediaBucketName", {});
		Template.fromStack(stacks.data).hasOutput("LiveBucketName", {});
		Template.fromStack(stacks.data).hasOutput("FrontendDeployBucketName", {});
		Template.fromStack(stacks.data).hasOutput("WebSocketConnectionTableName", {});
		Template.fromStack(stacks.data).hasOutput("AuroraClusterEndpoint", {});
		Template.fromStack(stacks.data).hasOutput("AuroraSecretArn", {});
		Template.fromStack(stacks.compute).hasOutput("EcsClusterName", {});
		Template.fromStack(stacks.api).hasOutput("HttpApiId", {});
		Template.fromStack(stacks.api).hasOutput("HttpApiEndpoint", {});
		Template.fromStack(stacks.api).hasOutput("WebSocketApiId", {});
		Template.fromStack(stacks.api).hasOutput("WebSocketApiEndpoint", {});
		Template.fromStack(stacks.frontend).hasOutput("FrontendBucketName", {});
		Template.fromStack(stacks.frontend).hasOutput("CloudFrontDistributionId", {});
	});

	it("enables DynamoDB TTL for WebSocket connection cleanup", () => {
		const stacks = synthStacks();

		Template.fromStack(stacks.data).hasResourceProperties("AWS::DynamoDB::Table", {
			TimeToLiveSpecification: {
				AttributeName: "expiresAt",
				Enabled: true,
			},
		});
	});

	it("creates immutable ECR repositories for all service images", () => {
		const stacks = synthStacks();
		const template = Template.fromStack(stacks.compute);

		for (const suffix of ["api", "realtime", "worker", "livekit", "web-build"]) {
			template.hasResourceProperties("AWS::ECR::Repository", {
				RepositoryName: `rebound-dev-${suffix}`,
				ImageTagMutability: "IMMUTABLE",
			});
		}
	});

	it("trusts only the configured GitHub repository through OIDC", () => {
		const stacks = synthStacks();
		const template = Template.fromStack(stacks.pipeline);

		template.hasResourceProperties("AWS::IAM::Role", {
			AssumeRolePolicyDocument: {
				Statement: Match.arrayWith([
					Match.objectLike({
						Condition: {
							StringEquals: {
								"token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
							},
							StringLike: {
								"token.actions.githubusercontent.com:sub": "repo:BrandonCasa/rebound-chat:*",
							},
						},
					}),
				]),
			},
		});
	});

	it("keeps prod resources in us-east-1 by default and retains stateful resources", () => {
		const app = new App({ context: { appEnv: "prod" } });
		const config = getEnvironmentConfig(app);
		const stacks = createReboundStacks(app, config);

		expect(stacks.network.region).toBe("us-east-1");
		expect(stacks.data.region).toBe("us-east-1");

		const dataTemplate = Template.fromStack(stacks.data);
		dataTemplate.hasResource("AWS::RDS::DBCluster", {
			DeletionPolicy: "Retain",
		});
		dataTemplate.hasResource("AWS::DynamoDB::Table", {
			DeletionPolicy: "Retain",
		});
		dataTemplate.hasResource("AWS::S3::Bucket", {
			DeletionPolicy: "Retain",
		});
	});

	it("registers an API Gateway account-wide CloudWatch Logs role for access logging", () => {
		const stacks = synthStacks();
		const template = Template.fromStack(stacks.api);

		template.resourceCountIs("AWS::ApiGateway::Account", 1);

		template.hasResourceProperties("AWS::IAM::Role", {
			AssumeRolePolicyDocument: {
				Statement: Match.arrayWith([
					Match.objectLike({
						Principal: { Service: "apigateway.amazonaws.com" },
					}),
				]),
			},
			ManagedPolicyArns: Match.arrayWith([
				Match.objectLike({
					"Fn::Join": Match.arrayWith([
						Match.arrayWith([
							Match.stringLikeRegexp("AmazonAPIGatewayPushToCloudWatchLogs"),
						]),
					]),
				}),
			]),
		});
	});

	it("creates CodeBuild projects in dry-run mode by default", () => {
		const stacks = synthStacks();
		const projects = Template.fromStack(stacks.pipeline).findResources("AWS::CodeBuild::Project");

		expect(Object.keys(projects)).toHaveLength(4);

		for (const project of Object.values(projects)) {
			const envVars = project.Properties.Environment.EnvironmentVariables;
			const dryRun = envVars.find((v: { Name: string }) => v.Name === "DRY_RUN");
			expect(dryRun?.Value).toBe("true");
		}
	});

	it("can enable real CodeBuild pushes for the Plan D image cutover", () => {
		const stacks = synthStacks("dev", { codeBuildDryRun: false });
		const projects = Template.fromStack(stacks.pipeline).findResources("AWS::CodeBuild::Project");

		for (const project of Object.values(projects)) {
			const envVars = project.Properties.Environment.EnvironmentVariables;
			const dryRun = envVars.find((v: { Name: string }) => v.Name === "DRY_RUN");
			expect(dryRun?.Value).toBe("false");
		}
	});

	it("keeps ECS services idle by default", () => {
		const stacks = synthStacks();
		const services = Template.fromStack(stacks.compute).findResources("AWS::ECS::Service");

		expect(Object.values(services).map((service) => service.Properties.DesiredCount)).toEqual([0, 0, 0, 0]);
	});

	it("can raise API and worker desired counts for the Plan D ECS smoke", () => {
		const stacks = synthStacks("dev", { serviceDesiredCounts: { api: 1, worker: 1 } });
		const services = Template.fromStack(stacks.compute).findResources("AWS::ECS::Service");
		const desiredCounts = Object.values(services).map((service) => service.Properties.DesiredCount);

		expect(desiredCounts.filter((desiredCount) => desiredCount === 1)).toHaveLength(2);
		expect(desiredCounts.filter((desiredCount) => desiredCount === 0)).toHaveLength(2);
	});

	it("can enable Plan D runtime smoke mode only on API and worker tasks", () => {
		const stacks = synthStacks("dev", { runtimeSmokeMode: true });
		const template = Template.fromStack(stacks.compute);
		const apiTaskDefinition = getTaskDefinitionForRole(template, "api");
		const workerTaskDefinition = getTaskDefinitionForRole(template, "worker");
		const realtimeTaskDefinition = getTaskDefinitionForRole(template, "realtime");

		expect(apiTaskDefinition).toBeDefined();
		expect(workerTaskDefinition).toBeDefined();
		expect(realtimeTaskDefinition).toBeDefined();

		const apiEnv = apiTaskDefinition!.Properties.ContainerDefinitions[0].Environment;
		const workerEnv = workerTaskDefinition!.Properties.ContainerDefinitions[0].Environment;
		const realtimeEnv = realtimeTaskDefinition!.Properties.ContainerDefinitions[0].Environment;

		expect(apiEnv).toEqual(expect.arrayContaining([expect.objectContaining({ Name: "REBOUND_ECS_SMOKE_MODE", Value: "1" })]));
		expect(workerEnv).toEqual(expect.arrayContaining([expect.objectContaining({ Name: "REBOUND_ECS_SMOKE_MODE", Value: "1" })]));
		expect(realtimeEnv.some((entry: { Name: string }) => entry.Name === "REBOUND_ECS_SMOKE_MODE")).toBe(false);
	});

	it("passes CloudFront distribution id to the frontend build project", () => {
		const stacks = synthStacks();
		const projects = Template.fromStack(stacks.pipeline).findResources("AWS::CodeBuild::Project");
		const projectList = Object.values(projects);
		expect(projectList.some((project) =>
			project.Properties.Environment.EnvironmentVariables.some(
				(v: { Name: string }) => v.Name === "CLOUDFRONT_DISTRIBUTION_ID"
			)
		)).toBe(true);
	});

	it("scopes CloudFront invalidation permission to a distribution", () => {
		const stacks = synthStacks();
		const policies = Template.fromStack(stacks.pipeline).findResources("AWS::IAM::Policy");
		const allStatements = Object.values(policies).flatMap((policy) =>
			Array.isArray(policy.Properties.PolicyDocument.Statement)
				? policy.Properties.PolicyDocument.Statement
				: [policy.Properties.PolicyDocument.Statement]
		);

		const cloudFrontStatement = allStatements.find((statement) => statement.Action === "cloudfront:CreateInvalidation");
		expect(cloudFrontStatement).toBeDefined();
		expect(JSON.stringify(cloudFrontStatement.Resource)).toContain("distribution/");
	});

	it("allows GitHubActionsRole to assume CDK bootstrap roles", () => {
		const stacks = synthStacks();
		const policies = Template.fromStack(stacks.pipeline).findResources("AWS::IAM::Policy");
		const allStatements = Object.values(policies).flatMap((policy) =>
			Array.isArray(policy.Properties.PolicyDocument.Statement)
				? policy.Properties.PolicyDocument.Statement
				: [policy.Properties.PolicyDocument.Statement]
		);

		const assumeRoleStatement = allStatements.find((statement) => statement.Action === "sts:AssumeRole");
		expect(assumeRoleStatement).toBeDefined();
		const serializedResources = JSON.stringify(assumeRoleStatement.Resource);
		expect(serializedResources).toContain("cdk-hnb659fds-deploy-role");
		expect(serializedResources).toContain("cdk-hnb659fds-file-publishing-role");
		expect(serializedResources).toContain("cdk-hnb659fds-image-publishing-role");
		expect(serializedResources).toContain("cdk-hnb659fds-lookup-role");
	});

	it("injects aws integration env vars into api/worker/realtime task definitions", () => {
		const stacks = synthStacks();
		const template = Template.fromStack(stacks.compute);

		template.hasResourceProperties("AWS::ECS::TaskDefinition", {
			ContainerDefinitions: Match.arrayWith([
				Match.objectLike({
					Environment: Match.arrayWith([
						Match.objectLike({ Name: "SERVER_ROLE", Value: "api" }),
						Match.objectLike({ Name: "S3_MEDIA_BUCKET" }),
						Match.objectLike({ Name: "S3_LIVE_BUCKET" }),
						Match.objectLike({ Name: "AURORA_SECRET_ARN" }),
						Match.objectLike({ Name: "AURORA_CLUSTER_ENDPOINT" }),
					]),
				}),
			]),
		});

		template.hasResourceProperties("AWS::ECS::TaskDefinition", {
			ContainerDefinitions: Match.arrayWith([
				Match.objectLike({
					Environment: Match.arrayWith([
						Match.objectLike({ Name: "SERVER_ROLE", Value: "worker" }),
						Match.objectLike({ Name: "S3_MEDIA_BUCKET" }),
						Match.objectLike({ Name: "S3_LIVE_BUCKET" }),
						Match.objectLike({ Name: "AURORA_SECRET_ARN" }),
						Match.objectLike({ Name: "AURORA_CLUSTER_ENDPOINT" }),
						Match.objectLike({ Name: "WS_CONNECTION_TABLE" }),
					]),
				}),
			]),
		});

		template.hasResourceProperties("AWS::ECS::TaskDefinition", {
			ContainerDefinitions: Match.arrayWith([
				Match.objectLike({
					Environment: Match.arrayWith([
						Match.objectLike({ Name: "SERVER_ROLE", Value: "realtime" }),
						Match.objectLike({ Name: "WS_CONNECTION_TABLE" }),
						Match.objectLike({ Name: "WEBSOCKET_API_ID" }),
						Match.objectLike({ Name: "WEBSOCKET_API_STAGE" }),
						Match.objectLike({ Name: "WEBSOCKET_API_ENDPOINT" }),
					]),
				}),
			]),
		});
	});

	it("uses ECR image wiring when imageTags context is provided", () => {
		const stacks = synthStacks("dev", { imageTags: { api: "deadbeefcafe" } });
		const template = Template.fromStack(stacks.compute);
		const apiTaskDefinition = getTaskDefinitionForRole(template, "api");
		expect(apiTaskDefinition).toBeDefined();

		const image = apiTaskDefinition!.Properties.ContainerDefinitions[0].Image;
		expect(typeof image).toBe("object");
		expect(image["Fn::Join"]).toBeDefined();
	});

	it("attaches the LiveKit security group to the LiveKit ECS service", () => {
		const stacks = synthStacks();
		const services = Template.fromStack(stacks.compute).findResources("AWS::ECS::Service");

		const securityGroupCounts = Object.values(services).map(
			(service) => service.Properties.NetworkConfiguration.AwsvpcConfiguration.SecurityGroups.length
		);

		// Three services use only the app SG (1 each); LiveKit uses app + livekit SGs (2).
		expect(securityGroupCounts.filter((n) => n === 1)).toHaveLength(3);
		expect(securityGroupCounts.filter((n) => n === 2)).toHaveLength(1);
	});

	it("does not attach wildcard admin permissions to service task roles", () => {
		const stacks = synthStacks();
		const policies = Template.fromStack(stacks.compute).findResources("AWS::IAM::Policy");

		for (const policy of Object.values(policies)) {
			const statements = policy.Properties.PolicyDocument.Statement;
			const statementList = Array.isArray(statements) ? statements : [statements];

			for (const statement of statementList) {
				const action = statement.Action;
				const resource = statement.Resource;
				const hasWildcardAction = action === "*" || (Array.isArray(action) && action.includes("*"));
				const hasWildcardResource = resource === "*" || (Array.isArray(resource) && resource.includes("*"));

				expect(hasWildcardAction && hasWildcardResource).toBe(false);
			}
		}
	});
});
