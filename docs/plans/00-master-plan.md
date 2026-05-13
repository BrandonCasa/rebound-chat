# Master Plan 00: AWS-Native WebRTC Migration Baseline (Dev-First)

This is the source-of-truth migration plan for moving Rebound to an AWS-native, WebRTC-first architecture while keeping HLS fallback available during rollout.

Scope for this document:

- Align all plan paths with the current monorepo layout (`client/electron`, `client/frontend`, `server`, `shared`).
- Record what is already complete versus what remains.
- Focus on finishing a working dev environment in `us-east-2`.
- Keep production cutover (`us-east-1`) and EC2 retirement out of scope for this plan revision.

## Locked Architecture Baseline

The platform baseline remains:

- Live transport primary: WebRTC via LiveKit.
- Fallback and rollback path: HLS.
- Infra as code: CDK v2 TypeScript in `cdk/`.
- Runtime: ECS Fargate.
- Database target: Aurora PostgreSQL.
- Object storage target: S3 for media/live assets/artifacts.
- Realtime target: API Gateway WebSocket APIs replacing Socket.IO.

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
- `server/src/socketio/` is still active and used.
- `server/src/live/control/socket.js` still drives live control over Socket.IO.
- `server/src/live/webrtc/` exists as scaffolding modules.
- `server/src/live/service.js` already returns transport-aware session envelopes.
- `LIVE_TRANSPORT_DEFAULT` is already handled in `server/src/live/config.js`.
- WebRTC availability is currently stubbed (not enabled end-to-end).

### Data layer state

- MongoDB/Mongoose remains canonical for most product data.
- Prisma exists only for stream-session related models in `server/prisma/schema.prisma`.
- GridFS is still active for existing media flows.

### AWS/CDK/infra state

- CDK stacks exist and synth/deploy for dev/prod environments.
- `cdk/lib/network-stack.ts`, `data-stack.ts`, `api-stack.ts`, `frontend-stack.ts`, and `pipeline-stack.ts` are real infrastructure.
- `cdk/lib/compute-stack.ts` creates ECS services with placeholder tasks and `desiredCount: 0`.
- Infra artifacts exist and are concrete:
  - `infra/docker/*.Dockerfile`
  - `infra/buildspec.*.yml`
  - `infra/taskdefs/*.json`
  - `infra/codedeploy/*-appspec.yml`
  - `infra/local/docker-compose.livekit.yml`

### Deployment state

- Legacy production deploy workflow still exists in `.github/workflows/deploy-new.yml` (EC2 + PM2 + Nginx).
- AWS pipeline scaffolding exists in repo, but the deployed dev pipeline was destroyed externally and dev runtime is not yet serving live traffic.

## Verified AWS Dev Estate (`us-east-2`)

Account: `722347332210`

Stacks last verified during dev provisioning:

- `Rebound-dev-Network`
- `Rebound-dev-Data`
- `Rebound-dev-Api`
- `Rebound-dev-Frontend`
- `Rebound-dev-Compute`
- `Rebound-dev-Pipeline` was also provisioned, then destroyed externally; it must be recreated and reverified before pipeline-dependent deployment work resumes.

Key observed outputs/resources:

- Aurora endpoint present in `Rebound-dev-Data` outputs.
- WebSocket connection DynamoDB table present with TTL.
- HTTP API endpoint and WebSocket API endpoint present from `Rebound-dev-Api`.
- CloudFront distribution and frontend bucket present from `Rebound-dev-Frontend`.
- ECR repos present: `rebound-dev-api`, `rebound-dev-worker`, `rebound-dev-realtime`, `rebound-dev-livekit`, `rebound-dev-web-build`.
- ECS services exist for api/worker/realtime/livekit with `desiredCount: 0`.

## Known Gaps to Resolve During Remaining Phases

- Compute services in `cdk/lib/compute-stack.ts` default to placeholder runtime; ECR image-tag overrides are now wired, but real image promotion is still pending.
- Deployed pipeline rehydration is pending after external teardown.
- No full API Gateway WebSocket route-handler runtime is in place yet.
- LiveKit tokening/webhook path is scaffolded but not fully integrated.
- Custom domains/ACM/Route53 wiring for dev hostnames is not complete.
- Existing EC2 workflow still serves as production path.

## Phase Status and Forward Plan

### Phase 0 - Architecture Baseline

Status: Complete

Completed outcomes:

- AWS-native WebRTC baseline recorded in ADR.
- LiveKit selected as SFU baseline.
- HLS retained as fallback/rollback path.

### Phase 1 - CDK Foundation

Status: Complete

Completed outcomes:

- `cdk/` app and stack decomposition are in place.
- Dev/prod region targeting exists.
- Stack tests exist.

Remaining in this phase:

- None for the baseline PR A slice; additional permission tightening remains ongoing as part of later PRs.

### Phase 2 - Container and Runtime Split

Status: Complete (scaffolded)

Completed outcomes:

- Dockerfiles, buildspecs, taskdefs, and appspecs exist.
- Server roles are split in runtime entry logic.

Remaining in this phase:

- Replace placeholder ECS task containers with real runtime images.
- Bring selected services from `desiredCount: 0` to live smoke counts in dev.

### Phase 3 - Aurora + S3 Migration

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

- Introduce repository boundaries and migration strategy for users/auth/chat domains.
- Keep production behavior stable while dual-write/read strategies are introduced.

#### Phase 3d - GridFS to S3 export and cutover

Status: Pending

- Build export tooling and metadata reconciliation.
- Feature-flag the serving path switch.

### Phase 4 - API Gateway WebSocket Migration

Status: Pending

Required outcomes:

- Build `server/src/realtime/` route-handler runtime for API Gateway WebSockets.
- Implement `$connect`, `$disconnect`, and routed product message handling.
- Store and manage connection state in DynamoDB table.
- Migrate live-control and chat/presence/watchers behavior off Socket.IO.

### Phase 5 - LiveKit Session/Token/Webhook Integration

Status: Pending

Required outcomes:

- Implement real token minting and role scoping in `server/src/live/webrtc`.
- Wire signed webhook ingestion and room/session lifecycle mapping.
- Advertise true WebRTC availability in session responses when configured.

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
- Preserve HLS fallback behavior and UX.

### Phase 8 - WebRTC Stats and Control Alignment

Status: Pending

Required outcomes:

- Extend live control protocol for WebRTC metrics.
- Add transport-aware recommendation logic.
- Surface meaningful streamer/viewer health signals in UI.

### Phase 9 - HLS Fallback, Recording, Cleanup

Status: Pending

Required outcomes:

- Keep robust HLS fallback while WebRTC matures.
- Ensure cleanup for LiveKit rooms, S3 prefixes, stale session rows, and stale realtime connections.
- Keep feature-flag rollback path fast and documented.

### Phase 10 - Dev CI/CD Cutover (`us-east-2`)

Status: Pending

Required outcomes:

- Use AWS pipeline path to build/push/deploy dev services.
- Replace placeholder ECS runtime with real images.
- Deploy frontend assets + invalidation through CloudFront flow.
- Keep `.github/workflows/deploy-new.yml` as production-only fallback until future production plan.

## Non-Goals for This Revision

- Production cutover in `us-east-1`.
- Retirement of EC2/PM2/Nginx.
- Reintroducing old deferred HLS-only plan set.
- Building a custom SFU.

## Exit Criteria for This Master Plan Revision

This plan revision is considered aligned when:

- `docs/plans/` only contains active AWS-aligned planning docs.
- All path references match current repo layout.
- Completed vs pending statuses reflect actual code and deployed dev estate.
- Remaining work is organized around reaching a real dev AWS live path before any production cutover.
