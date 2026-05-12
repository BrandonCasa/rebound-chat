import { Duration, Stack } from "aws-cdk-lib";
import { aws_cloudfront as cloudfront, aws_cloudfront_origins as origins, aws_s3 as s3 } from "aws-cdk-lib";
import type { Construct } from "constructs";

import type { ReboundStackProps } from "./stack-props";

export class FrontendStack extends Stack {
	readonly assetBucket: s3.Bucket;
	readonly distribution: cloudfront.Distribution;

	constructor(scope: Construct, id: string, props: ReboundStackProps) {
		super(scope, id, props);

		const { config } = props;

		this.assetBucket = new s3.Bucket(this, "FrontendAssetBucket", {
			encryption: s3.BucketEncryption.S3_MANAGED,
			enforceSSL: true,
			blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
			versioned: config.appEnv === "prod",
			removalPolicy: config.removalPolicy,
			autoDeleteObjects: config.autoDeleteObjects,
		});

		this.distribution = new cloudfront.Distribution(this, "Distribution", {
			defaultRootObject: "index.html",
			defaultBehavior: {
				origin: origins.S3BucketOrigin.withOriginAccessControl(this.assetBucket),
				viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
				allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
				cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD_OPTIONS,
				cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
			},
			errorResponses: [
				{
					httpStatus: 403,
					responseHttpStatus: 200,
					responsePagePath: "/index.html",
					ttl: Duration.minutes(5),
				},
				{
					httpStatus: 404,
					responseHttpStatus: 200,
					responsePagePath: "/index.html",
					ttl: Duration.minutes(5),
				},
			],
		});
	}
}
