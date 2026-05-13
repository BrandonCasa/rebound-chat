import { CfnOutput, Duration, Stack } from "aws-cdk-lib";
import {
	aws_apigatewayv2 as apigwv2,
	aws_dynamodb as dynamodb,
	aws_ec2 as ec2,
	aws_ecr as ecr,
	aws_ecs as ecs,
	aws_iam as iam,
	aws_logs as logs,
	aws_rds as rds,
	aws_s3 as s3,
} from "aws-cdk-lib";
import type { Construct } from "constructs";

import type { ImageTagOverrides } from "./config";
import type { ReboundStackProps } from "./stack-props";

interface ComputeStackProps extends ReboundStackProps {
	vpc: ec2.IVpc;
	appSecurityGroup: ec2.ISecurityGroup;
	liveKitSecurityGroup: ec2.ISecurityGroup;
	database: rds.DatabaseCluster;
	mediaBucket: s3.IBucket;
	liveBucket: s3.IBucket;
	websocketConnectionTable: dynamodb.ITable;
	websocketApi: apigwv2.CfnApi;
}

type RepositoryName = "api" | "realtime" | "worker" | "livekit" | "webBuild";
type ServiceImageName = "api" | "realtime" | "worker";

export class ComputeStack extends Stack {
	readonly cluster: ecs.Cluster;
	readonly repositories: Record<RepositoryName, ecr.Repository>;
	private readonly imageTags?: ImageTagOverrides;

	constructor(scope: Construct, id: string, props: ComputeStackProps) {
		super(scope, id, props);

		const { config, vpc, appSecurityGroup } = props;
		this.imageTags = config.imageTags;
		const websocketManagementEndpoint = `https://${props.websocketApi.ref}.execute-api.${Stack.of(this).region}.amazonaws.com/${config.appEnv}`;

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

		const apiContainer = this.resolveServiceContainer("api", {
			port: 6001,
			serviceName: "api",
		});
		const apiService = this.createIdleService("Api", {
			config,
			vpc,
			appSecurityGroup,
			desiredCount: config.serviceDesiredCounts.api,
			image: apiContainer.image,
			command: apiContainer.command,
			environment: {
				SERVER_ROLE: "api",
				PORT: "6001",
				S3_MEDIA_BUCKET: props.mediaBucket.bucketName,
				S3_LIVE_BUCKET: props.liveBucket.bucketName,
				AURORA_SECRET_ARN: props.database.secret!.secretArn,
				AURORA_CLUSTER_ENDPOINT: props.database.clusterEndpoint.socketAddress,
			},
			portMappings: [{ containerPort: 6001 }],
		});

		const realtimeContainer = this.resolveServiceContainer("realtime", {
			port: 6002,
			serviceName: "realtime",
		});
		const realtimeService = this.createIdleService("Realtime", {
			config,
			vpc,
			appSecurityGroup,
			desiredCount: config.serviceDesiredCounts.realtime,
			image: realtimeContainer.image,
			command: realtimeContainer.command,
			environment: {
				SERVER_ROLE: "realtime",
				PORT: "6002",
				WS_CONNECTION_TABLE: props.websocketConnectionTable.tableName,
				WEBSOCKET_API_ID: props.websocketApi.ref,
				WEBSOCKET_API_STAGE: config.appEnv,
				WEBSOCKET_API_ENDPOINT: websocketManagementEndpoint,
			},
			portMappings: [{ containerPort: 6002 }],
		});

		const workerContainer = this.resolveServiceContainer("worker", {
			port: 6003,
			serviceName: "worker",
		});
		const workerService = this.createIdleService("Worker", {
			config,
			vpc,
			appSecurityGroup,
			desiredCount: config.serviceDesiredCounts.worker,
			image: workerContainer.image,
			command: workerContainer.command,
			environment: {
				SERVER_ROLE: "worker",
				S3_MEDIA_BUCKET: props.mediaBucket.bucketName,
				S3_LIVE_BUCKET: props.liveBucket.bucketName,
				AURORA_SECRET_ARN: props.database.secret!.secretArn,
				AURORA_CLUSTER_ENDPOINT: props.database.clusterEndpoint.socketAddress,
				WS_CONNECTION_TABLE: props.websocketConnectionTable.tableName,
			},
			portMappings: [],
		});

		this.createIdleService("LiveKit", {
			config,
			vpc,
			appSecurityGroup,
			additionalSecurityGroups: [props.liveKitSecurityGroup],
			desiredCount: config.serviceDesiredCounts.livekit,
			image: ecs.ContainerImage.fromRegistry(config.liveKitImage),
			command: ["--dev", "--bind", "0.0.0.0"],
			environment: {
				LIVEKIT_KEYS: "devkey: devsecret",
			},
			portMappings: [
				{ containerPort: 7880, protocol: ecs.Protocol.TCP },
				{ containerPort: 7881, protocol: ecs.Protocol.TCP },
				{ containerPort: 7882, protocol: ecs.Protocol.UDP },
			],
		});

		props.database.secret!.grantRead(apiService.taskDefinition.taskRole);
		props.mediaBucket.grantReadWrite(apiService.taskDefinition.taskRole);
		props.liveBucket.grantRead(apiService.taskDefinition.taskRole);

		props.database.secret!.grantRead(workerService.taskDefinition.taskRole);
		props.mediaBucket.grantReadWrite(workerService.taskDefinition.taskRole);
		props.liveBucket.grantReadWrite(workerService.taskDefinition.taskRole);
		props.websocketConnectionTable.grantReadWriteData(workerService.taskDefinition.taskRole);

		props.websocketConnectionTable.grantReadWriteData(realtimeService.taskDefinition.taskRole);
		realtimeService.taskDefinition.taskRole.addToPrincipalPolicy(
			new iam.PolicyStatement({
				actions: ["execute-api:ManageConnections"],
				resources: [
					Stack.of(this).formatArn({
						service: "execute-api",
						resource: props.websocketApi.ref,
						resourceName: `${config.appEnv}/POST/@connections/*`,
					}),
				],
			})
		);

		new CfnOutput(this, "EcsClusterName", {
			value: this.cluster.clusterName,
			description: "ECS cluster name for Rebound runtime services",
		});

		for (const [name, repository] of Object.entries(this.repositories)) {
			new CfnOutput(this, `${name}RepositoryUri`, {
				value: repository.repositoryUri,
				description: `ECR repository URI for ${name} images`,
			});
		}
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

	private resolveServiceContainer(
		serviceName: ServiceImageName,
		placeholder: { port: number; serviceName: string }
	): { image: ecs.ContainerImage; command?: string[] } {
		const configuredTag = this.resolveImageTag(serviceName);
		if (configuredTag) {
			return {
				image: ecs.ContainerImage.fromEcrRepository(this.repositories[serviceName], configuredTag),
			};
		}

		if (serviceName === "worker") {
			return {
				image: ecs.ContainerImage.fromRegistry("public.ecr.aws/docker/library/node:22-alpine"),
				command: ["node", "-e", "setInterval(() => console.log(JSON.stringify({status:'ok',service:'worker'})), 30000)"],
			};
		}

		return {
			image: ecs.ContainerImage.fromRegistry("public.ecr.aws/docker/library/node:22-alpine"),
			command: [
				"node",
				"-e",
				`require('http').createServer((req,res)=>{res.writeHead(req.url==='/healthz'?200:404,{'content-type':'application/json'});res.end(JSON.stringify({status:req.url==='/healthz'?'ok':'not_found',service:'${placeholder.serviceName}'}));}).listen(process.env.PORT||${placeholder.port},'0.0.0.0')`,
			],
		};
	}

	private resolveImageTag(serviceName: ServiceImageName) {
		return this.imageTags?.[serviceName];
	}

	private createIdleService(
		idPrefix: string,
		props: {
			config: ReboundStackProps["config"];
			vpc: ec2.IVpc;
			appSecurityGroup: ec2.ISecurityGroup;
			additionalSecurityGroups?: ec2.ISecurityGroup[];
			desiredCount: number;
			image: ecs.ContainerImage;
			command?: string[];
			environment: Record<string, string>;
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
			environment: {
				APP_ENV: props.config.appEnv,
				AWS_REGION: Stack.of(this).region,
				LIVE_TRANSPORT_DEFAULT: "hls",
				...props.environment,
			},
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
			desiredCount: props.desiredCount,
			assignPublicIp: false,
			circuitBreaker: {
				rollback: true,
			},
			minHealthyPercent: 100,
			maxHealthyPercent: 200,
			securityGroups: [props.appSecurityGroup, ...(props.additionalSecurityGroups ?? [])],
			vpcSubnets: {
				subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
			},
		});
	}
}
