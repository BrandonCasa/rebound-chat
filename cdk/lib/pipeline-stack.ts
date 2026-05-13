import { CfnOutput, Stack } from "aws-cdk-lib";
import {
	aws_cloudfront as cloudfront,
	aws_codebuild as codebuild,
	aws_ecr as ecr,
	aws_iam as iam,
	aws_s3 as s3,
} from "aws-cdk-lib";
import type { Construct } from "constructs";

import type { ReboundStackProps } from "./stack-props";

interface PipelineStackProps extends ReboundStackProps {
	repositories: Record<"api" | "realtime" | "worker" | "livekit" | "webBuild", ecr.IRepository>;
	frontendBucket: s3.IBucket;
	distribution: cloudfront.IDistribution;
}

export class PipelineStack extends Stack {
	readonly githubActionsRole: iam.Role;

	constructor(scope: Construct, id: string, props: PipelineStackProps) {
		super(scope, id, props);

		const { config } = props;
		const repositorySubject = `repo:${config.githubOwner}/${config.githubRepo}:*`;
		const cdkQualifier = "hnb659fds";

		const provider = new iam.OpenIdConnectProvider(this, "GitHubOidcProvider", {
			url: "https://token.actions.githubusercontent.com",
			clientIds: ["sts.amazonaws.com"],
		});

		this.githubActionsRole = new iam.Role(this, "GitHubActionsRole", {
			assumedBy: new iam.WebIdentityPrincipal(provider.openIdConnectProviderArn, {
				StringEquals: {
					"token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
				},
				StringLike: {
					"token.actions.githubusercontent.com:sub": repositorySubject,
				},
			}),
			description: "Role assumed by GitHub Actions to start Rebound AWS deploy jobs",
		});

		const projects = {
			api: this.createProject("ApiBuild", "api", "infra/buildspec.api.yml", config, {
				IMAGE_REPOSITORY_URI: props.repositories.api.repositoryUri,
			}),
			worker: this.createProject("WorkerBuild", "worker", "infra/buildspec.worker.yml", config, {
				IMAGE_REPOSITORY_URI: props.repositories.worker.repositoryUri,
			}),
			frontend: this.createProject("FrontendBuild", "frontend", "infra/buildspec.frontend.yml", config, {
				IMAGE_REPOSITORY_URI: props.repositories.webBuild.repositoryUri,
				FRONTEND_BUCKET_NAME: props.frontendBucket.bucketName,
				CLOUDFRONT_DISTRIBUTION_ID: props.distribution.distributionId,
			}),
			livekit: this.createProject("LiveKitBuild", "livekit", "infra/buildspec.livekit.yml", config, {
				IMAGE_REPOSITORY_URI: props.repositories.livekit.repositoryUri,
			}),
		};

		this.githubActionsRole.addToPolicy(
			new iam.PolicyStatement({
				actions: ["codebuild:BatchGetBuilds", "codebuild:StartBuild"],
				resources: Object.values(projects).map((project) => project.projectArn),
			})
		);
		this.githubActionsRole.addToPolicy(
			new iam.PolicyStatement({
				actions: ["sts:AssumeRole"],
				resources: [
					`arn:aws:iam::${Stack.of(this).account}:role/cdk-${cdkQualifier}-deploy-role-${Stack.of(this).account}-${Stack.of(this).region}`,
					`arn:aws:iam::${Stack.of(this).account}:role/cdk-${cdkQualifier}-file-publishing-role-${Stack.of(this).account}-${Stack.of(this).region}`,
					`arn:aws:iam::${Stack.of(this).account}:role/cdk-${cdkQualifier}-image-publishing-role-${Stack.of(this).account}-${Stack.of(this).region}`,
					`arn:aws:iam::${Stack.of(this).account}:role/cdk-${cdkQualifier}-lookup-role-${Stack.of(this).account}-${Stack.of(this).region}`,
				],
			})
		);

		props.repositories.api.grantPullPush(projects.api);
		props.repositories.worker.grantPullPush(projects.worker);
		props.repositories.webBuild.grantPullPush(projects.frontend);
		props.repositories.livekit.grantPullPush(projects.livekit);
		props.frontendBucket.grantWrite(projects.frontend);
		projects.frontend.role?.addToPrincipalPolicy(
			new iam.PolicyStatement({
				actions: ["cloudfront:CreateInvalidation"],
				resources: [`arn:aws:cloudfront::${Stack.of(this).account}:distribution/${props.distribution.distributionId}`],
			})
		);

		new CfnOutput(this, "GitHubActionsRoleArn", {
			value: this.githubActionsRole.roleArn,
			description: "IAM role ARN for GitHub Actions OIDC deployments",
		});
	}

	private createProject(
		id: string,
		suffix: string,
		buildspecPath: string,
		config: ReboundStackProps["config"],
		environmentVariables: Record<string, string>
	) {
		return new codebuild.Project(this, id, {
			projectName: `rebound-${config.appEnv}-${suffix}`,
			source: codebuild.Source.gitHub({
				owner: config.githubOwner,
				repo: config.githubRepo,
				webhook: false,
			}),
			buildSpec: codebuild.BuildSpec.fromSourceFilename(buildspecPath),
			environment: {
				buildImage: codebuild.LinuxBuildImage.STANDARD_7_0,
				privileged: true,
			},
			environmentVariables: {
				APP_ENV: { value: config.appEnv },
				AWS_ACCOUNT_ID: { value: Stack.of(this).account },
				AWS_REGION: { value: config.region },
				DRY_RUN: { value: "true" },
				...Object.fromEntries(Object.entries(environmentVariables).map(([name, value]) => [name, { value }])),
			},
		});
	}
}
