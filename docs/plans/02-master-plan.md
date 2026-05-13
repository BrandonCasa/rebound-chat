# Master Plan 02: Dev Cutover Execution Slice (`us-east-2`)

This plan is the active next slice for reaching a working AWS dev environment that serves Rebound traffic with WebRTC primary and HLS fallback available.

It assumes the baseline in `docs/plans/00-master-plan.md` and the ADR in `docs/adr/0001-aws-native-webrtc-platform.md`.

## Scope and Constraints

In scope:

- Dev environment (`us-east-2`) only.
- Converting already-provisioned AWS resources into running services.
- Replacing stubs/placeholders with working runtime behavior.

Out of scope:

- Production cutover in `us-east-1`.
- EC2/PM2/Nginx retirement.
- Removing HLS fallback.

## Starting State (Required Assumptions)

- `Rebound-dev-{Network,Data,Api,Frontend,Compute,Pipeline}` stacks exist.
- ECR repos exist but are empty.
- ECS services exist with `desiredCount: 0`.
- API Gateway HTTP and WebSocket APIs exist.
- CloudFront distribution exists but frontend bucket is not serving the full app flow yet.
- Legacy deployment workflow `.github/workflows/deploy-new.yml` still exists.

## PR A: CDK + Pipeline Correctness

Goal: make CDK/Pipeline configuration internally consistent and ready for real deployments.

Status: Implemented in-repo, local verification complete, dev-stack deploy verification pending via GitHub Actions.

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

Implementation notes:

- `synth:dev` now synthesizes all stacks in `cdk/package.json` (`cdk synth --all --context appEnv=dev`).
- ECR image overrides are available via CDK context keys such as `--context imageTags.api=<tag>`.
- The deploy workflow expects the repository variable `REBOUND_DEV_GITHUB_ACTIONS_ROLE_ARN` to be set to the stack output `GitHubActionsRoleArn`.

Acceptance:

- `pnpm --filter rebound-cdk build`
- `pnpm --filter rebound-cdk test`
- `pnpm --filter rebound-cdk synth:dev`
- No wildcard-admin IAM regressions in stack tests.

## PR B: Server Runtime Dependencies + S3 Promotion

Goal: make server runtime AWS integrations explicit and production-like in dev.

Changes:

- Add explicit server dependencies required for target integrations:
  - LiveKit server SDK package
  - S3 client package
- Promote `server/src/live/storage.js` S3 path from optional to first-class and tested.
- Wire env-based bucket config (`S3_LIVE_BUCKET`, `S3_MEDIA_BUCKET`) consistently.
- Keep behavior backward-compatible under `LIVE_TRANSPORT_DEFAULT=hls`.

Acceptance:

- Server starts cleanly with and without WebRTC transport enabled.
- S3-backed live/media writes and reads pass integration checks in dev config.
- Existing HLS route behavior remains intact.

## PR C: LiveKit Token/Webhook Integration

Goal: make WebRTC session paths real at the API layer.

Changes:

- Implement actual tokening in `server/src/live/webrtc/{tokens,config,sessionMapper}.js`.
- Add/enable signed webhook ingestion in `server/src/live/webrtc/webhooks.js`.
- Update session response behavior in `server/src/live/service.js`:
  - Advertise WebRTC availability only when config is valid.
  - Keep HLS fallback fields present for hybrid mode.

Acceptance:

- Publisher/viewer token scopes are enforced by tests.
- Missing LiveKit config fails gracefully when WebRTC is requested.
- `LIVE_TRANSPORT_DEFAULT=hls` remains fully compatible.

## PR D: First Real Image Push + ECS Smoke (API/Worker)

Goal: run real API and worker containers on ECS in dev.

Changes:

- Build and push `api` and `worker` images to:
  - `rebound-dev-api`
  - `rebound-dev-worker`
- Update task defs/service wiring to use pushed image tags/digests.
- Set `desiredCount: 1` for api/worker in dev.
- Verify health checks and CloudWatch logs.

Acceptance:

- ECS services show running tasks for API and worker.
- `/healthz` is healthy through the intended dev ingress path.
- No crash-looping tasks.

## PR E: API Gateway WebSocket Runtime (`server/src/realtime`)

Goal: replace Socket.IO runtime path for dev with API Gateway WebSocket handlers.

Changes:

- Add `server/src/realtime/` implementation:
  - auth/connect/disconnect handlers
  - route dispatch
  - fanout helper using API Gateway Management API
  - DynamoDB connection state access
- Implement baseline routes for chat/presence/watchers/live-control.
- Deploy as the `realtime` ECS service.

Acceptance:

- Connect/disconnect lifecycle persisted in connection table.
- Fanout reaches connected clients for migrated routes.
- Runtime degrades gracefully on stale connection IDs.

## PR F: Frontend LiveKit Player + Transport Picker

Goal: make viewer playback transport-aware in frontend.

Changes:

- Add transport-oriented player structure under:
  - `client/frontend/src/features/player/transports/`
  - `client/frontend/src/features/player/hooks/` updates as needed
- Integrate LiveKit SDK playback path.
- Preserve HLS fallback selection path.
- Update stream/share pages so they do not assume HLS-only `playbackUrl`.

Acceptance:

- Browser connects to WebRTC playback in dev where available.
- WebRTC failure paths fall back to HLS when configured.
- Existing HLS-only sessions remain playable.

## PR G: Electron Broadcaster Transport Split

Goal: separate broadcaster transport orchestration from monolithic manager code.

Changes:

- Extract transport modules from `client/electron/main/electron-live-stream.js` into:
  - `client/electron/streaming/transports/whipTransport.js`
  - `client/electron/streaming/transports/hlsTransport.js`
  - `client/electron/streaming/transports/transportState.js`
- Wire `client/electron/streaming/output/whip.js` as selectable output.
- Keep current HLS pipeline operational.

Acceptance:

- Broadcaster can run HLS-only, WebRTC-only, and hybrid mode in dev (feature-gated as needed).
- Stop/teardown semantics are stable in each mode.
- Existing streaming tests remain green or updated with equivalent coverage.

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

## PR I: GridFS -> S3 Export and Feature-Flagged Media Switch

Goal: begin media storage migration without breaking existing behavior.

Changes:

- Build export tooling for GridFS objects to S3 buckets.
- Store and verify mapping metadata.
- Add feature flag to route media serving between GridFS and S3.
- Keep rollback path to GridFS while migration validates.

Acceptance:

- Exported sample set is readable from S3 via app routes.
- Existing media URLs remain compatible or redirect cleanly.
- No auth regressions on media access.

## PR J: Dev Deployment Workflow Cutover

Goal: make dev deploys go through AWS pipeline path rather than SSH/PM2 flow.

Changes:

- Add/update GitHub workflow for dev that triggers AWS build/deploy pipeline.
- Keep `.github/workflows/deploy-new.yml` intact for production fallback.
- Document release runbook for dev deployments.

Acceptance:

- A single GitHub-triggered dev deployment builds, pushes, and updates ECS services.
- Frontend artifacts publish and invalidate CloudFront.
- Rollback to prior dev task definition revision is documented and tested.

## Cross-PR Verification Checklist

Run as applicable per PR:

- `pnpm --filter rebound-cdk build`
- `pnpm --filter rebound-cdk test`
- `pnpm --filter rebound-cdk synth:dev`
- `pnpm --prefix server test`
- `pnpm --filter rebound-web build`
- `aws ecs describe-services` for desired/running counts
- `aws ecr list-images` for pushed artifacts
- `aws cloudformation describe-stacks` for expected outputs

## Completion Criteria

Master Plan 02 is complete when:

- Dev API, worker, realtime, and livekit services run as real ECS tasks.
- WebRTC session tokening and playback paths are functional in dev.
- HLS fallback remains available.
- Dev deployments run through AWS pipeline path.
- Remaining production cutover work is clearly isolated for the next master plan.
