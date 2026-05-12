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

	it("keeps prod resources in us-east-1 by default", () => {
		const app = new App({ context: { appEnv: "prod" } });
		const config = getEnvironmentConfig(app);
		const stacks = createReboundStacks(app, config);

		expect(stacks.network.region).toBe("us-east-1");
		expect(stacks.data.region).toBe("us-east-1");
	});
});
