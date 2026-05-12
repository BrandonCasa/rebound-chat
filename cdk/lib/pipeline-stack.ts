import { Stack } from "aws-cdk-lib";
import { aws_codebuild as codebuild, aws_ecr as ecr, aws_iam as iam, aws_s3 as s3 } from "aws-cdk-lib";
import type { Construct } from "constructs";

import type { ReboundStackProps } from "./stack-props";

interface PipelineStackProps extends ReboundStackProps {
	repositories: Record<string, ecr.IRepository>;
	frontendBucket: s3.IBucket;
	mediaBucket: s3.IBucket;
	liveBucket: s3.IBucket;
}

export class PipelineStack extends Stack {
	readonly githubActionsRole: iam.Role;

	constructor(scope: Construct, id: string, props: PipelineStackProps) {
		super(scope, id, props);

		const { config } = props;
		const repositorySubject = `repo:${config.githubOwner}/${config.githubRepo}:*`;

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

		const projects = [
			this.createProject("ApiBuild", "api", "infra/buildspec.api.yml", config),
			this.createProject("WorkerBuild", "worker", "infra/buildspec.worker.yml", config),
			this.createProject("FrontendBuild", "frontend", "infra/buildspec.frontend.yml", config),
			this.createProject("LiveKitBuild", "livekit", "infra/buildspec.livekit.yml", config),
		];

		this.githubActionsRole.addToPolicy(
			new iam.PolicyStatement({
				actions: ["codebuild:BatchGetBuilds", "codebuild:StartBuild"],
				resources: projects.map((project) => project.projectArn),
			})
		);

		for (const repository of Object.values(props.repositories)) {
			repository.grantPullPush(this.githubActionsRole);
			for (const project of projects) {
				repository.grantPullPush(project);
			}
		}

		props.frontendBucket.grantReadWrite(this.githubActionsRole);
		props.mediaBucket.grantReadWrite(this.githubActionsRole);
		props.liveBucket.grantReadWrite(this.githubActionsRole);
	}

	private createProject(id: string, suffix: string, buildspecPath: string, config: ReboundStackProps["config"]) {
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
			},
		});
	}
}
