import { Stack } from "aws-cdk-lib";
import { aws_apigatewayv2 as apigwv2, aws_logs as logs } from "aws-cdk-lib";
import type { Construct } from "constructs";

import type { ReboundStackProps } from "./stack-props";

export class ApiStack extends Stack {
	readonly httpApi: apigwv2.CfnApi;
	readonly websocketApi: apigwv2.CfnApi;

	constructor(scope: Construct, id: string, props: ReboundStackProps) {
		super(scope, id, props);

		const { config } = props;

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

		new apigwv2.CfnStage(this, "HttpApiStage", {
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

		this.websocketApi = new apigwv2.CfnApi(this, "WebSocketApi", {
			name: `rebound-${config.appEnv}-websocket`,
			protocolType: "WEBSOCKET",
			routeSelectionExpression: "$request.body.route",
		});

		const websocketAccessLogs = new logs.LogGroup(this, "WebSocketApiAccessLogs", {
			retention: config.appEnv === "prod" ? logs.RetentionDays.ONE_MONTH : logs.RetentionDays.ONE_WEEK,
			removalPolicy: config.removalPolicy,
		});

		new apigwv2.CfnStage(this, "WebSocketApiStage", {
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
	}
}
