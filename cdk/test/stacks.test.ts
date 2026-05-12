import { App } from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { describe, expect, it } from "vitest";

import { createReboundStacks } from "../lib/app";
import { getEnvironmentConfig } from "../lib/config";

const synthStacks = (appEnv = "dev") => {
	const app = new App({ context: { appEnv } });
	const config = getEnvironmentConfig(app);
	return createReboundStacks(app, config);
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
		Template.fromStack(stacks.data).hasOutput("WebSocketConnectionTableName", {});
		Template.fromStack(stacks.data).hasOutput("AuroraClusterEndpoint", {});
		Template.fromStack(stacks.data).hasOutput("AuroraSecretArn", {});
		Template.fromStack(stacks.compute).hasOutput("EcsClusterName", {});
		Template.fromStack(stacks.api).hasOutput("HttpApiId", {});
		Template.fromStack(stacks.api).hasOutput("WebSocketApiEndpoint", {});
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
								"token.actions.githubusercontent.com:sub": "repo:BrandonCasa/rebound-electron:*",
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
