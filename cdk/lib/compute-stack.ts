import { Duration, Stack } from "aws-cdk-lib";
import { aws_ec2 as ec2, aws_ecr as ecr, aws_ecs as ecs, aws_logs as logs } from "aws-cdk-lib";
import type { Construct } from "constructs";

import type { ReboundStackProps } from "./stack-props";

interface ComputeStackProps extends ReboundStackProps {
	vpc: ec2.IVpc;
	appSecurityGroup: ec2.ISecurityGroup;
}

type RepositoryName = "api" | "realtime" | "worker" | "livekit" | "webBuild";

export class ComputeStack extends Stack {
	readonly cluster: ecs.Cluster;
	readonly repositories: Record<RepositoryName, ecr.Repository>;

	constructor(scope: Construct, id: string, props: ComputeStackProps) {
		super(scope, id, props);

		const { config, vpc, appSecurityGroup } = props;

		this.cluster = new ecs.Cluster(this, "Cluster", {
			vpc,
			containerInsightsV2: ecs.ContainerInsights.ENHANCED,
		});

		this.repositories = {
			api: this.createRepository("ApiRepository", "api", config),
			realtime: this.createRepository("RealtimeRepository", "realtime", config),
			worker: this.createRepository("WorkerRepository", "worker", config),
			livekit: this.createRepository("LiveKitRepository", "livekit", config),
			webBuild: this.createRepository("WebBuildRepository", "web-build", config),
		};

		this.createIdleService("Api", {
			config,
			vpc,
			appSecurityGroup,
			image: ecs.ContainerImage.fromRegistry("public.ecr.aws/docker/library/node:22-alpine"),
			command: ["node", "-e", "setInterval(() => {}, 60000)"],
			portMappings: [{ containerPort: 6001 }],
		});

		this.createIdleService("Realtime", {
			config,
			vpc,
			appSecurityGroup,
			image: ecs.ContainerImage.fromRegistry("public.ecr.aws/docker/library/node:22-alpine"),
			command: ["node", "-e", "setInterval(() => {}, 60000)"],
			portMappings: [{ containerPort: 6002 }],
		});

		this.createIdleService("Worker", {
			config,
			vpc,
			appSecurityGroup,
			image: ecs.ContainerImage.fromRegistry("public.ecr.aws/docker/library/node:22-alpine"),
			command: ["node", "-e", "setInterval(() => {}, 60000)"],
			portMappings: [],
		});

		this.createIdleService("LiveKit", {
			config,
			vpc,
			appSecurityGroup,
			image: ecs.ContainerImage.fromRegistry(config.liveKitImage),
			command: ["--config", "/etc/livekit.yaml"],
			portMappings: [
				{ containerPort: 7880, protocol: ecs.Protocol.TCP },
				{ containerPort: 7881, protocol: ecs.Protocol.TCP },
				{ containerPort: 7882, protocol: ecs.Protocol.UDP },
			],
		});
	}

	private createRepository(id: string, suffix: string, config: ReboundStackProps["config"]) {
		return new ecr.Repository(this, id, {
			repositoryName: `rebound-${config.appEnv}-${suffix}`,
			imageScanOnPush: true,
			imageTagMutability: ecr.TagMutability.IMMUTABLE,
			lifecycleRules: [
				{
					description: "Keep the latest 30 images",
					maxImageCount: 30,
				},
			],
			removalPolicy: config.removalPolicy,
			emptyOnDelete: config.autoDeleteObjects,
		});
	}

	private createIdleService(
		idPrefix: string,
		props: {
			config: ReboundStackProps["config"];
			vpc: ec2.IVpc;
			appSecurityGroup: ec2.ISecurityGroup;
			image: ecs.ContainerImage;
			command: string[];
			portMappings: ecs.PortMapping[];
		}
	) {
		const task = new ecs.FargateTaskDefinition(this, `${idPrefix}TaskDefinition`, {
			cpu: idPrefix === "LiveKit" ? 1024 : 512,
			memoryLimitMiB: idPrefix === "LiveKit" ? 2048 : 1024,
		});

		const logGroup = new logs.LogGroup(this, `${idPrefix}LogGroup`, {
			retention: props.config.appEnv === "prod" ? logs.RetentionDays.ONE_MONTH : logs.RetentionDays.ONE_WEEK,
			removalPolicy: props.config.removalPolicy,
		});

		task.addContainer(`${idPrefix}Container`, {
			image: props.image,
			command: props.command,
			logging: ecs.LogDriver.awsLogs({
				streamPrefix: idPrefix.toLowerCase(),
				logGroup,
			}),
			healthCheck: idPrefix === "LiveKit" ? undefined : { command: ["CMD-SHELL", "true"], interval: Duration.seconds(30) },
			portMappings: props.portMappings,
		});

		return new ecs.FargateService(this, `${idPrefix}Service`, {
			cluster: this.cluster,
			taskDefinition: task,
			desiredCount: 0,
			assignPublicIp: false,
			circuitBreaker: {
				rollback: true,
			},
			minHealthyPercent: 100,
			maxHealthyPercent: 200,
			securityGroups: [props.appSecurityGroup],
			vpcSubnets: {
				subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
			},
		});
	}
}
