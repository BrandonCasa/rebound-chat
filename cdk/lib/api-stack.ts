import { CfnOutput, Stack } from "aws-cdk-lib";
import {
	aws_apigateway as apigw,
	aws_apigatewayv2 as apigwv2,
	aws_iam as iam,
	aws_logs as logs,
} from "aws-cdk-lib";
import type { Construct } from "constructs";

import type { ReboundStackProps } from "./stack-props";

export class ApiStack extends Stack {
	readonly httpApi: apigwv2.CfnApi;
	readonly websocketApi: apigwv2.CfnApi;

	constructor(scope: Construct, id: string, props: ReboundStackProps) {
		super(scope, id, props);

		const { config } = props;
		
		const apiGatewayCloudWatchRole = new iam.Role(this, "ApiGatewayCloudWatchRole", {
			assumedBy: new iam.ServicePrincipal("apigateway.amazonaws.com"),
			managedPolicies: [
				iam.ManagedPolicy.fromAwsManagedPolicyName(
					"service-role/AmazonAPIGatewayPushToCloudWatchLogs",
				),
			],
		});

		const apiGatewayAccount = new apigw.CfnAccount(this, "ApiGatewayAccount", {
			cloudWatchRoleArn: apiGatewayCloudWatchRole.roleArn,
		});

		this.httpApi = new apigwv2.CfnApi(this, "HttpApi", {
			name: `rebound-${config.appEnv}-http`,
			protocolType: "HTTP",
			corsConfiguration: {
				allowCredentials: true,
				allowHeaders: ["authorization", "content-type"],
				allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
				allowOrigins: [`https://${config.domainName}`],
			},
		});

		const httpAccessLogs = new logs.LogGroup(this, "HttpApiAccessLogs", {
			retention: config.appEnv === "prod" ? logs.RetentionDays.ONE_MONTH : logs.RetentionDays.ONE_WEEK,
			removalPolicy: config.removalPolicy,
		});

		const httpStage = new apigwv2.CfnStage(this, "HttpApiStage", {
			apiId: this.httpApi.ref,
			stageName: config.appEnv,
			autoDeploy: true,
			accessLogSettings: {
				destinationArn: httpAccessLogs.logGroupArn,
				format: JSON.stringify({
					requestId: "$context.requestId",
					routeKey: "$context.routeKey",
					status: "$context.status",
					responseLatency: "$context.responseLatency",
				}),
			},
		});
		httpStage.addDependency(apiGatewayAccount);

		this.websocketApi = new apigwv2.CfnApi(this, "WebSocketApi", {
			name: `rebound-${config.appEnv}-websocket`,
			protocolType: "WEBSOCKET",
			routeSelectionExpression: "$request.body.route",
		});

		const websocketAccessLogs = new logs.LogGroup(this, "WebSocketApiAccessLogs", {
			retention: config.appEnv === "prod" ? logs.RetentionDays.ONE_MONTH : logs.RetentionDays.ONE_WEEK,
			removalPolicy: config.removalPolicy,
		});

		const websocketStage = new apigwv2.CfnStage(this, "WebSocketApiStage", {
			apiId: this.websocketApi.ref,
			stageName: config.appEnv,
			autoDeploy: true,
			accessLogSettings: {
				destinationArn: websocketAccessLogs.logGroupArn,
				format: JSON.stringify({
					requestId: "$context.requestId",
					routeKey: "$context.routeKey",
					connectionId: "$context.connectionId",
					status: "$context.status",
				}),
			},
		});
		websocketStage.addDependency(apiGatewayAccount);

		new CfnOutput(this, "HttpApiId", {
			value: this.httpApi.ref,
			description: "API Gateway HTTP API ID",
		});

		new CfnOutput(this, "HttpApiUrl", {
			value: this.httpApi.attrApiEndpoint,
			description: "API Gateway HTTP API endpoint",
		});

		new CfnOutput(this, "WebSocketApiId", {
			value: this.websocketApi.ref,
			description: "API Gateway WebSocket API ID",
		});

		new CfnOutput(this, "WebSocketApiUrl", {
			value: this.websocketApi.attrApiEndpoint,
			description: "API Gateway WebSocket API endpoint",
		});

		new CfnOutput(this, "HttpApiEndpoint", {
			value: this.httpApi.attrApiEndpoint,
			description: "Deprecated compatibility alias for HttpApiUrl",
		});

		new CfnOutput(this, "WebSocketApiEndpoint", {
			value: this.websocketApi.attrApiEndpoint,
			description: "Deprecated compatibility alias for WebSocketApiUrl",
		});
	}
}
