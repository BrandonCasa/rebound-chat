# Master Plan 00: AWS-Native WebRTC Migration Baseline (Dev-First)

This is the source-of-truth migration plan for moving Rebound to an AWS-native, WebRTC-first architecture while removing the legacy MongoDB/GridFS/Socket.IO/EC2 deployment stack.

HLS may exist during migration as a short-lived compatibility path, but it is no longer treated as a permanent rollback architecture. The final target is AWS-native runtime, Aurora PostgreSQL persistence, S3 object/media storage, API Gateway WebSockets, ECS/Fargate services, CloudFront frontend delivery, and LiveKit/WebRTC live media.

Scope for this document:

- Align all plan paths with the current monorepo layout (`client/electron`, `client/frontend`, `server`, `shared`).
- Record what is already complete versus what remains.
- Focus on finishing a working dev environment in `us-east-2`.
- Include explicit removal gates for MongoDB, GridFS, Socket.IO, EC2/PM2/Nginx deploys, and other legacy runtime assumptions.
- Keep production cutover (`us-east-1`) as a later environment rollout, but do not preserve legacy systems as long-term product architecture.

## Locked Architecture Baseline

The platform baseline remains:

- Live transport primary: WebRTC via LiveKit.
- Temporary migration compatibility path: HLS, behind explicit cutover controls until WebRTC health gates pass.
- Infra as code: CDK v2 TypeScript in `cdk/`.
- Runtime: ECS Fargate.
- Database target: Aurora PostgreSQL.
- Object storage target: S3 for media/live assets/artifacts.
- Realtime target: API Gateway WebSocket APIs replacing Socket.IO.
- Legacy removal target: no MongoDB, Mongoose, GridFS, Socket.IO, EC2/PM2/Nginx app hosting, or SSH deploy workflow remains in supported runtime paths.

Configuration baseline:

- Environment-scoped AWS Systems Manager Parameter Store names are the canonical contract for runtime and pipeline configuration.
- CloudFormation/CDK stack outputs are the canonical contract for discoverable infrastructure values such as endpoints, ARNs, bucket names, repository URIs, and service URLs.
- Tasks must reference configuration by parameter/output name, not by manually copied literal values.
- CDK must automatically create the required parameter names for both `dev` and `prod`.
- Parameter naming must be deterministic by environment, under the pattern `/rebound/<env>/<domain>/<name>`.

Reference ADR: `docs/adr/0001-aws-native-webrtc-platform.md`.

## Current Repository Reality (Verified)

### Runtime and app layout

- Electron broadcaster/runtime code is in `client/electron/main` and `client/electron/streaming`.
- Frontend React app is in `client/frontend/src`.
- Server API/realtime/live code is in `server/src`.
- Shared protocol/types are in `shared/streaming`.
- The old plan-era root paths (`public/...`, root `src/...`) are no longer canonical.

### Server state

- `server/src/app.js` supports `SERVER_ROLE=api|worker|combined|realtime`.
- `server/src/socketio/` is still active and used, but is now a removal target.
- `server/src/live/control/socket.js` still drives live control over Socket.IO and must move to API Gateway WebSockets.
- `server/src/live/webrtc/` now contains LiveKit token/webhook integration helpers.
- `server/src/live/service.js` returns transport-aware session envelopes and can advertise WebRTC when LiveKit config is valid.
- `LIVE_TRANSPORT_DEFAULT` is already handled in `server/src/live/config.js`.
- WebRTC is not yet enabled end-to-end across broadcaster and frontend.

### Data layer state

- MongoDB/Mongoose remains canonical for most product data today, but is no longer acceptable as a target runtime dependency.
- Prisma exists for stream-session related models in `server/prisma/schema.prisma` and must expand to all persisted product domains.
- GridFS is still active for existing media flows and must be exported to S3, then deleted from runtime.

### AWS/CDK/infra state

- CDK stacks exist and synth/deploy for dev/prod environments.
- `cdk/lib/network-stack.ts`, `data-stack.ts`, `api-stack.ts`, `frontend-stack.ts`, and `pipeline-stack.ts` are real infrastructure.
- `cdk/lib/compute-stack.ts` creates ECS services with placeholder tasks and `desiredCount: 0`.
- Parameter/output discipline is not fully standardized yet and must be normalized as part of the remaining infra and deployment slices.
- Infra artifacts exist and are concrete:
  - `infra/docker/*.Dockerfile`
  - `infra/buildspec.*.yml`
  - `infra/taskdefs/*.json`
  - `infra/codedeploy/*-appspec.yml`
  - `infra/local/docker-compose.livekit.yml`

### Deployment state

- Legacy production deploy workflow still exists in `.github/workflows/deploy-new.yml` (EC2 + PM2 + Nginx) and must be removed after AWS deployment parity.
- AWS pipeline scaffolding exists in repo, but the deployed dev pipeline was destroyed externally and dev runtime is not yet serving live traffic.

## Verified AWS Dev Estate (`us-east-2`)

Account: `722347332210`

Stacks last verified during dev provisioning:

- `Rebound-dev-Network`
- `Rebound-dev-Data`
- `Rebound-dev-Api`
- `Rebound-dev-Frontend`
- `Rebound-dev-Compute`
- `Rebound-dev-Pipeline` was recreated and reverified on May 13, 2026; CodeBuild projects are deployed with Plan D push mode enabled.

Key observed outputs/resources:

- Aurora endpoint present in `Rebound-dev-Data` outputs.
- WebSocket connection DynamoDB table present with TTL.
- HTTP API endpoint and WebSocket API endpoint present from `Rebound-dev-Api`.
- CloudFront distribution and frontend bucket present from `Rebound-dev-Frontend`.
- ECR repos present: `rebound-dev-api`, `rebound-dev-worker`, `rebound-dev-realtime`, `rebound-dev-livekit`, `rebound-dev-web-build`.
- First Plan D API/worker images are pushed with tag `plan-d-bd49300ddfe1-20260513-003749`.
- ECS services exist for api/worker/realtime/livekit with `desiredCount: 0`.

Required config contract from this point forward:

- Every environment must expose database connection discovery, runtime secret references, bucket names, repository URIs, service endpoints, and deployment role ARNs through named AWS parameters and/or stack outputs.
- Any new task in these plans that needs configuration must specify the parameter names or output names it depends on.
- No task should depend on a manual console copy step for long-lived configuration values.

## Known Gaps to Resolve During Remaining Phases

- Compute services in `cdk/lib/compute-stack.ts` default to idle desired counts; ECR image-tag overrides are wired and API/worker task definitions now reference the first pushed Plan D images.
- API/worker desired counts are still held at `0` because current production server startup initializes MongoDB/Mongoose before the API listener starts.
- No full API Gateway WebSocket route-handler runtime is in place yet.
- LiveKit tokening/webhook path is implemented in-repo; broadcaster/frontend WebRTC integration remains pending.
- Custom domains/ACM/Route53 wiring for dev hostnames is not complete.
- Existing EC2 workflow still serves as production path today, but is a removal target rather than a future fallback.
- MongoDB/Mongoose/GridFS remain in runtime code and must be replaced by Aurora/S3-backed repositories.

## Phase Status and Forward Plan

### Phase 0 - Architecture Baseline

Status: Complete

Completed outcomes:

- AWS-native WebRTC baseline recorded in ADR.
- LiveKit selected as SFU baseline.
- HLS retained only as a temporary compatibility path during WebRTC validation.

### Phase 1 - CDK Foundation

Status: Complete

Completed outcomes:

- `cdk/` app and stack decomposition are in place.
- Dev/prod region targeting exists.
- Stack tests exist.

Remaining in this phase:

- None for the baseline PR A slice; additional permission tightening remains ongoing as part of later PRs.
- Normalize environment-scoped Parameter Store creation and output naming so downstream runtime and deploy slices consume names instead of ad hoc literals.

### Phase 2 - Container and Runtime Split

Status: Complete (scaffolded)

Completed outcomes:

- Dockerfiles, buildspecs, taskdefs, and appspecs exist.
- Server roles are split in runtime entry logic.

Remaining in this phase:

- Replace placeholder ECS task containers with real runtime images.
- Bring selected services from `desiredCount: 0` to live smoke counts in dev.

### Phase 3 - Aurora + S3 Full Cutover

Status: In progress (split)

#### Phase 3a - Prisma stream-session boundary

Status: Complete

- Prisma schema exists for stream-session domain models.
- Supporting migration note exists at `docs/prisma-stream-session-migration-note.md`.

#### Phase 3b - S3 live/media backing for active server paths

Status: Pending

- Promote S3 path from optional/fallback into tested primary implementation for target routes.
- Ensure required AWS SDK deps are explicit and validated in server runtime.

#### Phase 3c - Auth/users/chat relational migration

Status: Pending

- Expand Prisma/Aurora schema and repositories for users, auth/session metadata, chat, stream sessions, media metadata, and remaining product data.
- Replace direct Mongoose access with Aurora-backed repositories.
- Use temporary dual-read/export checks only as migration tooling; do not keep MongoDB as a runtime fallback.

#### Phase 3d - MongoDB/GridFS export and deletion

Status: Pending

- Build one-way MongoDB/GridFS export tooling into Aurora/S3 with idempotent verification.
- Cut media serving/upload paths to S3-backed metadata and objects.
- Delete GridFS reads/writes, Mongoose models, MongoDB boot code, Mongo memory server tests, and Mongo-specific dependencies after verification passes.

### Phase 4 - API Gateway WebSocket Migration

Status: Pending

Required outcomes:

- Build `server/src/realtime/` route-handler runtime for API Gateway WebSockets.
- Implement `$connect`, `$disconnect`, and routed product message handling.
- Store and manage connection state in DynamoDB table.
- Migrate live-control and chat/presence/watchers behavior off Socket.IO.
- Remove Socket.IO runtime startup and dependencies after route parity is verified.

### Phase 5 - LiveKit Session/Token/Webhook Integration

Status: Implemented in-repo, local verification complete

Required outcomes:

- Keep real token minting and role scoping covered in `server/src/live/webrtc`.
- Keep signed webhook ingestion and room/session lifecycle mapping covered in tests.
- Continue wiring broadcaster/frontend paths so WebRTC can become the default live transport.

### Phase 6 - Electron Broadcaster Transport Split

Status: Pending

Required outcomes:

- Extract transport state/lifecycle from `client/electron/main/electron-live-stream.js`.
- Introduce transport modules under `client/electron/streaming/transports`.
- Support explicit transport mode selection (`hls`, `webrtc`, `hybrid`).

### Phase 7 - Frontend Viewer Transport Split

Status: Pending

Required outcomes:

- Add transport-aware player structure under `client/frontend/src/features/player/transports`.
- Integrate LiveKit SDK playback path.
- Preserve HLS fallback behavior only behind an explicit temporary migration flag.

### Phase 8 - WebRTC Stats and Control Alignment

Status: Pending

Required outcomes:

- Extend live control protocol for WebRTC metrics.
- Add transport-aware recommendation logic.
- Surface meaningful streamer/viewer health signals in UI.

### Phase 9 - Legacy Live Cleanup

Status: Pending

Required outcomes:

- Move HLS fallback behind an explicit temporary compatibility flag or remove it from default session creation once WebRTC health gates pass.
- Ensure cleanup for LiveKit rooms, S3 prefixes, stale session rows, and stale realtime connections.
- Delete HLS-only assumptions, legacy env names, and local-only live relay behavior that no longer maps to the AWS target.

### Phase 10 - Dev CI/CD Cutover (`us-east-2`)

Status: Pending

Required outcomes:

- Use AWS pipeline path to build/push/deploy dev services.
- Replace placeholder ECS runtime with real images.
- Deploy frontend assets + invalidation through CloudFront flow.
- Remove or disable `.github/workflows/deploy-new.yml` after AWS deployment parity is verified.

### Phase 11 - Legacy System Deletion

Status: Pending

Required outcomes:

- Remove MongoDB, Mongoose, GridFS, and Mongo memory server dependencies and configuration.
- Remove Socket.IO runtime and client dependencies after API Gateway WebSocket migration.
- Remove EC2/PM2/Nginx deployment workflows, scripts, docs, and environment assumptions.
- Update developer setup so local and CI use Aurora/PostgreSQL-compatible services plus S3/LocalStack-compatible object storage.
- Add static checks or tests that fail if legacy runtime dependencies are reintroduced.

## Non-Goals for This Revision

- Running production traffic in `us-east-1` before dev AWS parity is proven.
- Reintroducing old deferred HLS-only plan set.
- Building a custom SFU.
- Keeping MongoDB/GridFS/Socket.IO/EC2 deployment paths as permanent fallbacks.

## Exit Criteria for This Master Plan Revision

This plan revision is considered aligned when:

- `docs/plans/` only contains active AWS-aligned planning docs.
- All path references match current repo layout.
- Completed vs pending statuses reflect actual code and deployed dev estate.
- Remaining work is organized around reaching a real dev AWS live path before any production cutover.
- Aurora/S3/API Gateway/ECS/LiveKit are the only supported target systems.
- MongoDB, Mongoose, GridFS, Socket.IO, EC2/PM2/Nginx app hosting, SSH deploys, and HLS-only assumptions have explicit removal gates.
- Required dev/prod configuration values are automatically created under stable AWS parameter names and exposed through predictable stack outputs.
