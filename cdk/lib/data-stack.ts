import { CfnOutput, Duration, Stack } from "aws-cdk-lib";
import { aws_dynamodb as dynamodb, aws_ec2 as ec2, aws_elasticache as elasticache, aws_rds as rds, aws_s3 as s3 } from "aws-cdk-lib";
import type { Construct } from "constructs";

import type { ReboundStackProps } from "./stack-props";

interface DataStackProps extends ReboundStackProps {
	vpc: ec2.IVpc;
	appSecurityGroup: ec2.ISecurityGroup;
}

export class DataStack extends Stack {
	readonly database: rds.DatabaseCluster;
	readonly mediaBucket: s3.Bucket;
	readonly liveBucket: s3.Bucket;
	readonly frontendBucket: s3.Bucket;
	readonly websocketConnectionTable: dynamodb.Table;
	readonly redisSecurityGroup: ec2.SecurityGroup;

	constructor(scope: Construct, id: string, props: DataStackProps) {
		super(scope, id, props);

		const { config, vpc, appSecurityGroup } = props;

		this.mediaBucket = this.createApplicationBucket("MediaBucket", "media", config);
		this.liveBucket = this.createApplicationBucket("LiveBucket", "live", config);
		this.frontendBucket = this.createApplicationBucket("FrontendDeployBucket", "frontend", config);

		this.websocketConnectionTable = new dynamodb.Table(this, "WebSocketConnectionTable", {
			partitionKey: { name: "connectionId", type: dynamodb.AttributeType.STRING },
			billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
			timeToLiveAttribute: "expiresAt",
			pointInTimeRecoverySpecification: {
				pointInTimeRecoveryEnabled: config.appEnv === "prod",
			},
			removalPolicy: config.removalPolicy,
		});

		const databaseSecurityGroup = new ec2.SecurityGroup(this, "DatabaseSecurityGroup", {
			vpc,
			description: "Aurora PostgreSQL access for Rebound application tasks",
			allowAllOutbound: true,
		});
		databaseSecurityGroup.addIngressRule(appSecurityGroup, ec2.Port.tcp(5432), "Application database access");

		this.database = new rds.DatabaseCluster(this, "AuroraPostgres", {
			engine: rds.DatabaseClusterEngine.auroraPostgres({
				version: rds.AuroraPostgresEngineVersion.of("16.4", "16"),
			}),
			credentials: rds.Credentials.fromGeneratedSecret("rebound"),
			defaultDatabaseName: "rebound",
			writer: rds.ClusterInstance.serverlessV2("writer", {
				publiclyAccessible: false,
			}),
			serverlessV2MinCapacity: config.auroraMinAcu,
			serverlessV2MaxCapacity: config.auroraMaxAcu,
			securityGroups: [databaseSecurityGroup],
			vpc,
			vpcSubnets: {
				subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
			},
			backup: {
				retention: Duration.days(config.appEnv === "prod" ? 14 : 3),
			},
			deletionProtection: config.appEnv === "prod",
			removalPolicy: config.removalPolicy,
		});

		this.redisSecurityGroup = new ec2.SecurityGroup(this, "RedisSecurityGroup", {
			vpc,
			description: "Redis access for LiveKit and realtime workers",
			allowAllOutbound: true,
		});
		this.redisSecurityGroup.addIngressRule(appSecurityGroup, ec2.Port.tcp(6379), "Application Redis access");

		const redisSubnetGroup = new elasticache.CfnSubnetGroup(this, "RedisSubnetGroup", {
			description: "Private subnets for Rebound Redis",
			subnetIds: vpc.privateSubnets.map((subnet) => subnet.subnetId),
		});

		new elasticache.CfnCacheCluster(this, "RedisCluster", {
			cacheNodeType: config.appEnv === "prod" ? "cache.t4g.small" : "cache.t4g.micro",
			engine: "redis",
			numCacheNodes: 1,
			cacheSubnetGroupName: redisSubnetGroup.ref,
			vpcSecurityGroupIds: [this.redisSecurityGroup.securityGroupId],
		});

		new CfnOutput(this, "MediaBucketName", {
			value: this.mediaBucket.bucketName,
			description: "S3 bucket for media metadata and media objects",
		});

		new CfnOutput(this, "LiveBucketName", {
			value: this.liveBucket.bucketName,
			description: "S3 bucket for live HLS/WebRTC session artifacts",
		});

		new CfnOutput(this, "FrontendDeployBucketName", {
			value: this.frontendBucket.bucketName,
			description: "S3 bucket reserved for frontend deployment handoff artifacts",
		});

		new CfnOutput(this, "WebSocketConnectionTableName", {
			value: this.websocketConnectionTable.tableName,
			description: "DynamoDB table for API Gateway WebSocket connection records",
		});

		new CfnOutput(this, "AuroraClusterEndpoint", {
			value: this.database.clusterEndpoint.hostname,
			description: "Aurora PostgreSQL cluster writer endpoint",
		});

		new CfnOutput(this, "AuroraSecretArn", {
			value: this.database.secret!.secretArn,
			description: "Secrets Manager ARN for Aurora PostgreSQL credentials",
		});
	}

	private createApplicationBucket(id: string, purpose: string, config: ReboundStackProps["config"]) {
		return new s3.Bucket(this, id, {
			encryption: s3.BucketEncryption.S3_MANAGED,
			enforceSSL: true,
			blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
			versioned: config.appEnv === "prod",
			lifecycleRules: [
				{
					id: `${purpose}-abort-incomplete-multipart`,
					abortIncompleteMultipartUploadAfter: Duration.days(7),
				},
			],
			removalPolicy: config.removalPolicy,
			autoDeleteObjects: config.autoDeleteObjects,
		});
	}
}
