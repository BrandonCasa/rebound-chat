import { CfnOutput, Fn, Stack } from "aws-cdk-lib";
import { aws_ec2 as ec2 } from "aws-cdk-lib";
import type { Construct } from "constructs";

import type { ReboundStackProps } from "./stack-props";

export class NetworkStack extends Stack {
	readonly vpc: ec2.Vpc;
	readonly appSecurityGroup: ec2.SecurityGroup;
	readonly liveKitSecurityGroup: ec2.SecurityGroup;

	constructor(scope: Construct, id: string, props: ReboundStackProps) {
		super(scope, id, props);

		const { config } = props;

		this.vpc = new ec2.Vpc(this, "Vpc", {
			maxAzs: 2,
			natGateways: config.natGateways,
			subnetConfiguration: [
				{
					name: "public",
					subnetType: ec2.SubnetType.PUBLIC,
					cidrMask: 24,
				},
				{
					name: "private",
					subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
					cidrMask: 24,
				},
				{
					name: "isolated",
					subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
					cidrMask: 24,
				},
			],
		});

		this.appSecurityGroup = new ec2.SecurityGroup(this, "AppSecurityGroup", {
			vpc: this.vpc,
			description: "Security group for Rebound ECS application tasks",
			allowAllOutbound: true,
		});

		this.liveKitSecurityGroup = new ec2.SecurityGroup(this, "LiveKitSecurityGroup", {
			vpc: this.vpc,
			description: "Security group for LiveKit signaling and media tasks",
			allowAllOutbound: true,
		});

		this.liveKitSecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(7880), "LiveKit signaling");
		this.liveKitSecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(7881), "LiveKit TCP fallback");
		this.liveKitSecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.udp(7882), "LiveKit UDP media");
		this.liveKitSecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.udpRange(50000, 50100), "LiveKit UDP media range");

		new CfnOutput(this, "VpcId", {
			value: this.vpc.vpcId,
			description: "VPC ID for Rebound application resources",
		});

		new CfnOutput(this, "PrivateSubnetIds", {
			value: Fn.join(
				",",
				this.vpc.privateSubnets.map((subnet) => subnet.subnetId)
			),
			description: "Private subnet IDs for ECS and data-plane resources",
		});
	}
}
