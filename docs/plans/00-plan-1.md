# Plan 0 Update: AWS-Native WebRTC and Hosting Migration

## Summary

Update `plans/00-plan-0.md` so WebRTC-first streaming is designed around AWS from the start:

- Production runs in `us-east-1`; dev runs in `us-east-2`.
- CDK v2 TypeScript lives in `cdk/` and owns all AWS infrastructure through CloudFormation.
- Runtime services run on ECS Fargate.
- The React SPA is hosted from S3 behind CloudFront.
- The app database migrates from MongoDB/Mongoose/GridFS to Aurora PostgreSQL on RDS; binary/media objects move to S3.
- API Gateway WebSocket APIs replace Socket.IO for realtime control/chat/presence.
- LiveKit is the chosen SFU, deployed on Fargate with ElastiCache Redis and load balancers for WebRTC signaling/media.
- GitHub Actions uses OIDC to trigger AWS CodeBuild and CodeDeploy; no long-lived AWS keys in GitHub secrets.

## Key Changes

### AWS/CDK foundation

- Add `cdk/` as a TypeScript CDK v2 app with environment-aware stacks:
  - `NetworkStack`: VPC, public/private isolated subnets, NAT, security groups, VPC endpoints.
  - `DataStack`: Aurora PostgreSQL, Secrets Manager credentials, S3 buckets for uploads/live artifacts, ElastiCache Redis for LiveKit.
  - `ComputeStack`: ECS cluster, Fargate services, ECR repos, ALB/NLB listeners, CloudWatch logs.
  - `ApiStack`: API Gateway HTTP API and WebSocket API, custom domains, stages, throttling, access logs.
  - `FrontendStack`: S3 website asset bucket, CloudFront distribution, ACM certs, Route53 records.
  - `PipelineStack`: CodeBuild projects, CodeDeploy apps/deployment groups, IAM OIDC role for GitHub.
- CDK context defines `dev` as `us-east-2` and `prod` as `us-east-1`.
- CDK bootstrapping is required per account/region using AWS’s standard CDK bootstrap process.

### Application architecture

- Split deployable services into Docker images:
  - `web-build`: build-only image/job that emits static Vite assets for S3/CloudFront.
  - `api`: Express HTTP API service on Fargate behind an ALB or API Gateway HTTP API private integration.
  - `realtime`: API Gateway WebSocket route handler service on Fargate; replaces Socket.IO semantics with a custom JSON protocol.
  - `livekit`: LiveKit SFU service on Fargate with Redis and NLB UDP/TCP exposure.
  - `worker`: background jobs for cleanup, migrations, email/media processing, and stream lifecycle cleanup.
- API Gateway WebSockets are not Socket.IO-compatible, so all current Socket.IO event contracts must be migrated to route-keyed messages with connection IDs stored in Aurora or DynamoDB. Use DynamoDB for ephemeral WebSocket connection state unless there is a strong reason to keep it relational.
- Live media does not flow through API Gateway. WebRTC media uses LiveKit/NLB paths; API Gateway only handles product signaling/control.

### Database and storage migration

- Introduce Aurora PostgreSQL as the canonical application database.
- Replace Mongoose models with a relational data layer, preferably Prisma unless a different ORM is already chosen before implementation.
- Move GridFS-style binary storage to S3:
  - user uploads/media attachments;
  - live HLS fallback assets if retained;
  - build artifacts and deployment bundles.
- Add migration scripts for:
  - users/auth/session data;
  - chat/server/room/message entities;
  - friendships/DMs;
  - stream session metadata;
  - media metadata and GridFS object export to S3.
- Keep MongoDB read-only during migration validation, then cut over writes to Aurora.

### CI/CD

- Replace `deploy-new.yml` SSH/PM2/nginx deployment with GitHub-to-AWS deployment workflows:
  - GitHub Actions assumes an AWS IAM role through OIDC.
  - GitHub starts environment-specific CodeBuild projects.
  - CodeBuild runs tests, builds Docker images, pushes to ECR, builds frontend assets, and emits deployment artifacts.
  - GitHub invokes CodeDeploy for ECS services using the generated task definitions/AppSpec files.
- Add Docker and build artifacts:
  - root/server Dockerfiles or a shared multi-stage Dockerfile;
  - `buildspec.api.yml`, `buildspec.worker.yml`, `buildspec.frontend.yml`, `buildspec.livekit.yml`;
  - ECS task definition templates;
  - CodeDeploy AppSpec files.
- Use CodeDeploy blue/green for ECS services where supported. For services behind an NLB, default to all-at-once if AWS service constraints require it.

### WebRTC Plan 0 alignment

- Update Plan 0 so LiveKit-on-AWS is no longer a candidate spike default but the chosen implementation baseline.
- Use WHIP where FFmpeg/LiveKit compatibility is verified; otherwise use LiveKit-supported ingress/publishing paths.
- Keep HLS as fallback/recording during migration, stored in S3 instead of local disk.
- Add AWS metrics to the plan: ECS task health, NLB target health, LiveKit room/session metrics, TURN/relay ratio, API Gateway WebSocket connection counts, Aurora performance, Redis health, and CloudFront error rates.

## Public Interfaces and Config

- Add environment variables grouped by service:
  - `DATABASE_URL`, `AWS_REGION`, `APP_ENV`, `S3_MEDIA_BUCKET`, `S3_LIVE_BUCKET`.
  - `API_GATEWAY_WEBSOCKET_ENDPOINT`, `WEBSOCKET_CONNECTION_TABLE`.
  - `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `REDIS_URL`.
  - `LIVE_TRANSPORT_DEFAULT=webrtc|hls|hybrid`.
- Replace Socket.IO client assumptions with an app WebSocket envelope:
  - route/action field for API Gateway route selection;
  - auth token on connect;
  - `connectionId` stored server-side;
  - explicit messages for chat, presence, live-control, viewer stats, streamer stats.
- Extend live session API responses with AWS/WebRTC fields:
  - LiveKit room/token info;
  - WebRTC playback metadata;
  - HLS fallback URL;
  - ICE/TURN config if not fully handled by LiveKit.

## Test Plan

- CDK:
  - `cdk synth` for `dev` and `prod`.
  - Snapshot/assertion tests for VPC, Aurora, ECS services, API Gateway WebSocket routes, S3/CloudFront, IAM least privilege, and region-specific config.
- Server:
  - Unit tests for Aurora-backed repositories replacing Mongoose models.
  - Migration tests from representative Mongo fixtures to PostgreSQL rows and S3 objects.
  - API Gateway WebSocket route handler tests for connect, disconnect, auth failure, chat, presence, and live-control messages.
- CI/CD:
  - CodeBuild dry-run build for each Docker image.
  - ECR push validation.
  - CodeDeploy artifact validation for ECS task definition and AppSpec files.
- Streaming:
  - LiveKit local/dev smoke test with one publisher and two viewers.
  - WebRTC playback fallback to HLS.
  - CloudWatch alarms fire on failed ECS deployments, unhealthy LiveKit targets, Aurora connection saturation, and elevated WebSocket errors.
- End-to-end:
  - Dev environment deployment in `us-east-2`.
  - Production deployment in `us-east-1` after dev validation.
  - Rollback test through CodeDeploy.

## Assumptions and Defaults

- CDK language: TypeScript.
- Database: Aurora PostgreSQL on RDS.
- ECS launch type: Fargate only.
- Frontend hosting: S3 + CloudFront.
- SFU: LiveKit.
- CI/CD ownership: GitHub Actions triggers AWS CodeBuild/CodeDeploy through OIDC.
- CDK controls all AWS resources, including VPC, ECS, RDS/Aurora, API Gateway, S3, CloudFront, ECR, CodeBuild, CodeDeploy, IAM, Route53, ACM, Secrets Manager, CloudWatch, and ElastiCache.
- API Gateway WebSockets replace Socket.IO; they do not host WebRTC media.
- References used: AWS CDK bootstrapping, API Gateway WebSocket integrations, ECS CodeDeploy blue/green, CodeBuild Docker/ECR guidance, RDS CDK constructs, and API Gateway WebSocket management API.
