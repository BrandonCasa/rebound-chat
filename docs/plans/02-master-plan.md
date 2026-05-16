# Master Plan 02: Dev Cutover Execution Slice (`us-east-2`)

This plan is the active next slice for reaching a working AWS dev environment that serves Rebound traffic from the AWS-native platform only.

The target state is explicit: Aurora PostgreSQL is the only application database, S3 is the only media/object store, API Gateway WebSockets replace Socket.IO, ECS/Fargate replaces EC2/PM2/Nginx runtime hosting, and LiveKit/WebRTC is the primary live media path. MongoDB, Mongoose, GridFS, Socket.IO runtime paths, SSH/PM2 deploys, and legacy HLS-only assumptions are removal targets, not long-term fallbacks.

It assumes the baseline in `docs/plans/00-master-plan.md` and the ADR in `docs/adr/0001-aws-native-webrtc-platform.md`.

Current tactical note: the deployed CDK pipeline was destroyed externally after the first scaffolding work. Until it is recreated, prioritize codebase runtime slices that make the server, live media, and client paths AWS-ready without requiring the pipeline to be live.

## Configuration Contract

Use this contract across every remaining task in this plan:

- Runtime configuration must be referenced by AWS parameter name, not by copied literal secret values or one-off environment notes.
- Infrastructure discovery values must be referenced by CloudFormation/CDK output name when they are not secrets.
- CDK is responsible for automatically creating the environment-scoped parameter set for both `dev` and `prod`.
- Parameter names must be deterministic and environment-scoped under `/rebound/<env>/<domain>/<name>`.
- Tasks in this document should name the parameters and outputs they require.

Baseline parameter families:

- `/rebound/<env>/database/url`
- `/rebound/<env>/database/host`
- `/rebound/<env>/database/port`
- `/rebound/<env>/database/name`
- `/rebound/<env>/database/credentials-secret-arn`
- `/rebound/<env>/storage/media-bucket`
- `/rebound/<env>/storage/live-bucket`
- `/rebound/<env>/livekit/url`
- `/rebound/<env>/livekit/api-key`
- `/rebound/<env>/livekit/api-secret`
- `/rebound/<env>/livekit/webhook-secret`
- `/rebound/<env>/deploy/github-actions-role-arn`

Baseline output families:

- `AuroraEndpoint`
- `AuroraPort`
- `AuroraDatabaseName`
- `AuroraCredentialsSecretArn`
- `MediaBucketName`
- `LiveBucketName`
- `HttpApiUrl`
- `WebSocketApiUrl`
- `CloudFrontDistributionDomainName`
- `GitHubActionsRoleArn`
- `ApiRepositoryUri`
- `WorkerRepositoryUri`
- `RealtimeRepositoryUri`
- `LiveKitRepositoryUri`

## Scope and Constraints

In scope:

- Dev environment (`us-east-2`) only.
- Converting already-provisioned AWS resources into running services.
- Replacing stubs/placeholders with working runtime behavior.
- Migrating all runtime data access away from MongoDB/Mongoose/GridFS to Aurora PostgreSQL and S3.
- Removing legacy runtime and deployment paths as soon as their AWS replacements are verified.
- Keeping short-lived compatibility shims only when needed to export data, compare behavior, or avoid data loss during cutover.

Out of scope:

- Production cutover in `us-east-1`.
- Indefinite rollback to MongoDB, GridFS, Socket.IO, EC2, PM2, Nginx, or SSH-based deploys.
- Adding new features on top of legacy persistence or deployment systems.
- Treating HLS as a permanent primary live transport.

## Starting State (Required Assumptions)

- `Rebound-dev-{Network,Data,Api,Frontend,Compute}` stacks were provisioned and validated.
- `Rebound-dev-Pipeline` has been recreated in `us-east-2` and CodeBuild projects are deployed with `DRY_RUN=false` for Plan D image pushes.
- ECR repos exist; `rebound-dev-api` and `rebound-dev-worker` contain the first Plan D image tag.
- ECS services exist with `desiredCount: 0`.
- API Gateway HTTP and WebSocket APIs exist.
- CloudFront distribution exists but frontend bucket is not serving the full app flow yet.
- Legacy deployment workflow `.github/workflows/deploy-new.yml` still exists.
- MongoDB/Mongoose/GridFS paths still exist in the app and must be migrated or deleted before this plan is complete.
- Socket.IO live-control/chat paths still exist and must be replaced by API Gateway WebSocket routes before this plan is complete.

## PR A: CDK + Pipeline Correctness

Goal: make CDK/Pipeline configuration internally consistent and ready for real deployments.

Status: Implemented in-repo, local verification complete, deployed pipeline rehydration pending.

Changes:

- Fix GitHub OIDC target repo values:
  - `cdk/lib/config.ts`
  - `cdk/cdk.json`
  - `cdk/test/stacks.test.ts`
- In `cdk/lib/compute-stack.ts`, replace placeholder inline containers with image wiring suitable for ECR-backed tasks.
- Ensure env blocks/permissions are aligned for API, worker, realtime, and livekit services.
- Add/confirm CloudFront invalidation integration path in stack/pipeline wiring.
- Keep controlled switch for CodeBuild dry-run to real mode.
- Add `.github/workflows/cdk-deploy-dev.yml` for branch-driven CDK deploys (`workflow_dispatch`).
- Automatically create the required `/rebound/dev/...` and `/rebound/prod/...` Parameter Store names in CDK.
- Publish stable output names for database, bucket, API, CDN, and repository discovery.

Implementation notes:

- `synth:dev` now synthesizes all stacks in `cdk/package.json` (`cdk synth --all --context appEnv=dev`).
- ECR image overrides are available via CDK context keys such as `--context imageTags.api=<tag>`.
- The deploy workflow expects the repository variable `REBOUND_DEV_GITHUB_ACTIONS_ROLE_ARN` to be set to the stack output `GitHubActionsRoleArn`.
- New tasks in this plan should cite the exact parameter names or output names they require instead of embedding account-specific values directly in the task text.

Acceptance:

- `pnpm --filter rebound-cdk build`
- `pnpm --filter rebound-cdk test`
- `pnpm --filter rebound-cdk synth:dev`
- No wildcard-admin IAM regressions in stack tests.
- Required `dev` and `prod` configuration parameters are created automatically with deterministic names.
- Required runtime and deploy discovery values are available by stable output name.

## PR B: Server Runtime Dependencies + S3 Promotion

Goal: make server runtime AWS integrations explicit and production-like in dev.

Status: Implemented in-repo, local verification complete.

Changes:

- Add explicit server dependencies required for target integrations:
  - LiveKit server SDK package
  - S3 client package
- Promote `server/src/live/storage.js` S3 path from optional to first-class and tested.
- Wire env-based bucket config (`S3_LIVE_BUCKET`, `S3_MEDIA_BUCKET`) consistently.
- Keep behavior compatible under `LIVE_TRANSPORT_DEFAULT=hls` only as a temporary migration aid while WebRTC is being verified.

Acceptance:

- Server starts cleanly with and without WebRTC transport enabled.
- S3-backed live/media writes and reads pass integration checks in dev config.
- Existing HLS route behavior remains intact.

Implementation notes:

- `server/package.json`, root `pnpm-lock.yaml`, and `server/pnpm-lock.yaml` include explicit `@aws-sdk/client-s3` and `livekit-server-sdk` dependencies.
- `server/src/live/config.js` resolves the CDK-provided `S3_LIVE_BUCKET` first. Legacy `LIVE_S3_BUCKET` compatibility is temporary and must be removed in the legacy cleanup slice.
- `server/src/live/storage.js` has a first-class S3 adapter with configured key prefixes, clear missing-bucket errors, content-type propagation, batched deletes, and local-storage path escape protection.
- `server/test/live.storage.test.js` covers S3 env resolution, S3 write/read/delete/prefix cleanup behavior, and local path safety without reaching AWS.
- Task-level config references for this slice should use names such as `/rebound/<env>/storage/live-bucket`, `/rebound/<env>/storage/media-bucket`, and `/rebound/<env>/database/url`.

Local verification:

- `pnpm --prefix server exec mocha test/live.storage.test.js --timeout 20000`
- `pnpm --prefix server exec cross-env NODE_ENV=test MONGOMS_PORT=27019 REBOUND_DEV_DB_PATH=./dev-test REBOUND_RESET_DEV_DB=1 mocha test/live.storage.test.js test/live.transport.test.js test/live.routes.test.js --timeout 20000`
- `pnpm --prefix server test`

## PR C: LiveKit Token/Webhook Integration

Goal: make WebRTC session paths real at the API layer.

Status: Implemented in-repo, local verification complete.

Changes:

- Implement actual tokening in `server/src/live/webrtc/{tokens,config,sessionMapper}.js`.
- Add/enable signed webhook ingestion in `server/src/live/webrtc/webhooks.js`.
- Update session response behavior in `server/src/live/service.js`:
  - Advertise WebRTC availability only when config is valid.
  - Keep HLS fallback fields present for hybrid mode.

Acceptance:

- Publisher/viewer token scopes are enforced by tests.
- Missing LiveKit config fails gracefully when WebRTC is requested.
- `LIVE_TRANSPORT_DEFAULT=hls` remains compatible only as a temporary migration mode.

Implementation notes:

- `server/src/live/webrtc/{tokens,config,sessionMapper,webhooks}.js` now mint scoped LiveKit JWTs, normalize LiveKit config, map rooms to sessions, and verify signed webhook callbacks.
- `server/src/live/service.js` advertises WebRTC only when LiveKit token config is valid and keeps HLS fields present for hybrid compatibility.
- `server/src/routes/live.js` exposes signed LiveKit webhook ingestion at `/live/api/webhooks/livekit`.

Local verification:

- `pnpm --prefix server exec cross-env NODE_ENV=test MONGOMS_PORT=27019 REBOUND_DEV_DB_PATH=./dev-test REBOUND_RESET_DEV_DB=1 mocha test/live.webrtc.tokens.test.js test/live.storage.test.js test/live.transport.test.js test/live.routes.test.js --timeout 20000`
- `pnpm --prefix server test`

## PR D: First Real Image Push + ECS Smoke (API/Worker)

Goal: run real API and worker containers on ECS in dev.

Status: In progress; CDK deploy controls are implemented, the dev pipeline is rehydrated, API/worker images are pushed, task definitions reference the pushed tags, and the repo startup blocker has been removed locally. The remaining Plan D work is ECS desired-count verification in dev.

Changes:

- Build and push `api` and `worker` images to:
  - `rebound-dev-api`
  - `rebound-dev-worker`
- Update task defs/service wiring to use pushed image tags/digests.
- Set `desiredCount: 1` for api/worker in dev.
- Verify health checks and CloudWatch logs.

Implementation notes:

- Dev ECS services remain idle by default.
- Plan D uses explicit CDK context for real image deployment:
  - `codeBuildDryRun=false`
  - `imageTags.api=<tag>`
  - `imageTags.worker=<tag>`
  - `serviceDesiredCounts.api=1`
  - `serviceDesiredCounts.worker=1`
  - `runtimeSmokeMode=true` only as an optional dev-only compatibility guard for health-only smoke checks.
- Repository gate cleared: `SERVER_ROLE=api|worker` no longer hard-requires MongoDB/Mongoose during dev cutover startup. `/healthz` now treats Aurora and S3 as required dependencies for API/worker dev cutover mode, while Mongo-backed product routes fail with controlled dependency errors until those domains are migrated.
- Plan D execution should consume repository URIs, bucket names, and database/livekit config through the declared parameter/output names rather than manually copied console values.

Execution record, May 13, 2026:

- Recreated `Rebound-dev-Pipeline` in `us-east-2`.
- Set CodeBuild `DRY_RUN=false` through CDK context.
- Pushed API/worker image tag `plan-d-bd49300ddfe1-20260513-003749`.
- Updated API task definition to `722347332210.dkr.ecr.us-east-2.amazonaws.com/rebound-dev-api:plan-d-bd49300ddfe1-20260513-003749`.
- Updated worker task definition to `722347332210.dkr.ecr.us-east-2.amazonaws.com/rebound-dev-worker:plan-d-bd49300ddfe1-20260513-003749`.
- Left API/worker desired counts at `0` pending the follow-up ECS desired-count deploy and runtime verification after the startup decoupling change landed.

Acceptance:

- ECS services show running tasks for API and worker.
- `/healthz` is healthy through the intended dev ingress path.
- No crash-looping tasks.

## PR E: API Gateway WebSocket Runtime (`server/src/realtime`)

Goal: replace Socket.IO runtime path with API Gateway WebSocket handlers and make Socket.IO removable.

Changes:

- Add `server/src/realtime/` implementation:
  - auth/connect/disconnect handlers
  - route dispatch
  - fanout helper using API Gateway Management API
  - DynamoDB connection state access
- Implement baseline routes for chat/presence/watchers/live-control.
- Deploy as the `realtime` ECS service.
- Remove Socket.IO server startup from AWS roles after route parity is verified.

Acceptance:

- Connect/disconnect lifecycle persisted in connection table.
- Fanout reaches connected clients for migrated routes.
- Runtime degrades gracefully on stale connection IDs.
- No dev AWS runtime path depends on `server/src/socketio/`.

## PR F: Frontend LiveKit Player + Transport Picker

Goal: make viewer playback WebRTC-first in frontend while retaining temporary HLS compatibility during cutover.

Changes:

- Add transport-oriented player structure under:
  - `client/frontend/src/features/player/transports/`
  - `client/frontend/src/features/player/hooks/` updates as needed
- Integrate LiveKit SDK playback path.
- Preserve HLS fallback selection path only behind an explicit temporary compatibility flag.
- Update stream/share pages so they do not assume HLS-only `playbackUrl`.

Acceptance:

- Browser connects to WebRTC playback in dev where available.
- WebRTC failure paths fall back to HLS when configured.
- Existing HLS-only sessions remain playable until the legacy live cleanup slice removes HLS-only session creation.

## PR G: Electron Broadcaster Transport Split

Goal: separate broadcaster transport orchestration from monolithic manager code and make WebRTC publishing the target path.

Changes:

- Extract transport modules from `client/electron/main/electron-live-stream.js` into:
  - `client/electron/streaming/transports/whipTransport.js`
  - `client/electron/streaming/transports/hlsTransport.js`
  - `client/electron/streaming/transports/transportState.js`
- Wire `client/electron/streaming/output/whip.js` as selectable output.
- Keep current HLS pipeline operational only as temporary compatibility during WebRTC validation.

Acceptance:

- Broadcaster can run WebRTC-only and hybrid mode in dev, with HLS-only limited to temporary migration tests.
- Stop/teardown semantics are stable in each mode.
- Existing streaming tests remain green or updated with equivalent coverage.
- WebRTC publishing has a clear promotion gate after which HLS-only broadcast code can be removed.

## PR H: Dev Domains, TLS, and Frontend Delivery Hardening

Goal: remove unstable endpoint assumptions by wiring proper dev hostnames and certs.

Changes:

- Add or complete Route53 + ACM + domain wiring for:
  - `dev.rebound.nexus`
  - `api.dev.rebound.nexus`
  - `ws.dev.rebound.nexus`
  - `rtc.dev.rebound.nexus`
- Finalize frontend artifact deployment and CloudFront invalidation workflow.

Acceptance:

- Dev app and APIs resolve on intended hostnames.
- TLS is valid across frontend/api/ws/rtc endpoints.
- Frontend deploy + invalidate flow is repeatable.

## PR I: Aurora + S3 Data Cutover and MongoDB/GridFS Removal

Goal: remove MongoDB/Mongoose/GridFS from runtime by moving all persisted application data to Aurora PostgreSQL and all media/object data to S3.

Changes:

- Expand Prisma/Aurora schema and repository coverage for users, auth/session metadata, chat, stream sessions, media metadata, and any remaining product data.
- Replace direct Mongoose model access with repository interfaces backed by Aurora.
- Build one-way export tooling from MongoDB/GridFS into Aurora/S3 with idempotent verification reports.
- Move media serving and upload paths to S3-backed metadata and object access.
- Remove GridFS reads/writes after migrated data verification passes.
- Delete Mongoose models, MongoDB connection boot, GridFS bucket initialization, Mongo memory server test dependencies, and Mongo-specific env/config.
- Remove `MONGOMS_*`, `REBOUND_DEV_DB_PATH`, Mongo URI, GridFS, and Mongoose setup from tests and local scripts.

Acceptance:

- Full server test suite runs without MongoDB, Mongo memory server, Mongoose, or GridFS.
- Runtime starts in API/worker/realtime roles with Aurora and S3 configured, and fails fast if legacy MongoDB config is supplied as the active store.
- Exported data has count/checksum verification for each migrated collection/object family.
- Existing public media URLs either resolve through Aurora/S3 metadata or redirect cleanly without reading GridFS.
- `server/package.json` no longer includes MongoDB, Mongoose, GridFS, or Mongo memory server packages.

## PR J: Dev Deployment Workflow Cutover

Goal: recreate the dev pipeline and make dev deploys go through AWS pipeline path only.

Changes:

- Add/update GitHub workflow for dev that triggers AWS build/deploy pipeline.
- Remove or disable `.github/workflows/deploy-new.yml` once the AWS dev deployment path is repeatable.
- Document release runbook for dev deployments.
- Ensure deployment automation resolves environment-specific configuration from `/rebound/dev/...` and `/rebound/prod/...` parameter names and stable stack outputs.

Acceptance:

- A single GitHub-triggered dev deployment builds, pushes, and updates ECS services.
- Frontend artifacts publish and invalidate CloudFront.
- Rollback to prior dev task definition revision is documented and tested.
- No dev deployment path uses SSH, PM2, Nginx, or EC2-hosted application processes.
- Runbooks and automation consume config by parameter/output name only.

## PR K: Legacy Runtime Removal

Goal: delete legacy runtime code and configuration after AWS replacements are verified.

Changes:

- Remove Socket.IO server/runtime code after API Gateway WebSocket route parity is accepted.
- Remove HLS-only live session assumptions after WebRTC publish/playback is the default and hybrid fallback gates are complete.
- Remove legacy env variables, scripts, docs, task assumptions, and tests tied to EC2/PM2/Nginx, MongoDB/GridFS, Socket.IO, or local-only HLS relay behavior.
- Update user-facing and developer docs to describe Aurora/S3/API Gateway/ECS/LiveKit as the only supported architecture.

Acceptance:

- Static searches for `mongoose`, `mongodb`, `GridFS`, `gridfs`, `socket.io`, `PM2`, `Nginx`, and `.github/workflows/deploy-new.yml` show no runtime or deployment dependencies.
- Any remaining mentions are explicitly historical docs or migration notes.
- Dev AWS smoke validates API, worker, realtime, frontend, and LiveKit without legacy services running.

## Cross-PR Verification Checklist

Run as applicable per PR:

- `pnpm --filter rebound-cdk build`
- `pnpm --filter rebound-cdk test`
- `pnpm --filter rebound-cdk synth:dev`
- `pnpm --prefix server test`
- `pnpm --filter rebound-web build`
- Prisma/Aurora migration and seed checks for migrated domains
- S3 media/live object read/write checks without GridFS
- `aws ecs describe-services` for desired/running counts
- `aws ecr list-images` for pushed artifacts
- `aws cloudformation describe-stacks` for expected outputs
- `aws ssm get-parameters-by-path --path /rebound/dev/ --recursive`
- `aws ssm get-parameters-by-path --path /rebound/prod/ --recursive`

## Completion Criteria

Master Plan 02 is complete when:

- Dev API, worker, realtime, and livekit services run as real ECS tasks.
- WebRTC session tokening and playback paths are functional in dev.
- HLS fallback is either explicitly temporary behind a cutover flag or removed from default session creation.
- Dev deployments run through AWS pipeline path.
- Aurora PostgreSQL is the only application database used at runtime.
- S3 is the only media/live object store used at runtime.
- MongoDB, Mongoose, GridFS, Socket.IO, SSH deploys, PM2, and Nginx are absent from dev runtime and deployment paths.
- Remaining production cutover work is clearly isolated for the next master plan.
- Required dev/prod parameters and outputs are automatically created and all plan tasks consume them by name.
