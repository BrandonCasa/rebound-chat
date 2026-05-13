# Master Plan 02: Next Execution Slice for AWS/WebRTC Migration

This plan turns the first AWS/WebRTC scaffolding pass into the next implementable batch. It does not replace `plans/00-master-plan.md`; it narrows the next pull requests so the migration can advance without cutting over production or changing the default HLS runtime behavior.

## Current Baseline

The repository now has the first foundation pieces from Master Plan 00:

- `docs/adr/0001-aws-native-webrtc-platform.md` locks the AWS-native baseline: LiveKit, Aurora PostgreSQL, S3, API Gateway WebSockets, ECS Fargate, and CDK v2 TypeScript.
- `infra/local/docker-compose.livekit.yml` and `infra/local/livekit/` provide a local LiveKit plus Redis compatibility stack.
- `projectscripts/probe-ffmpeg-webrtc.js` probes the bundled FFmpeg for WHIP, authorization, H.264, and Opus capability.
- `public/streaming/output/whip.js` adds an opt-in FFmpeg WHIP output builder, and `public/streaming/pipeline.js` can select it explicitly while HLS remains the default output.
- `cdk/` contains the first CDK v2 TypeScript workspace with dev/prod environment config, stack skeletons, and assertion tests.
- `infra/buildspec.*.yml` files exist as placeholders for API, worker, frontend, and LiveKit build jobs.

The next work must preserve these constraints:

- Existing EC2/PM2/Nginx deployment remains untouched.
- HLS remains the default live transport.
- Existing streaming and server tests remain green.
- AWS CLI use is read-only unless an implementation task explicitly asks to deploy or mutate AWS resources.

## Execution Goals

1. Harden the AWS/CDK foundation so it is ready for dev-environment deployment work.
2. Add local/container build artifacts for each target service without switching production deployment.
3. Split backend startup responsibilities so API, worker, and realtime concerns can run independently.
4. Introduce Prisma and a low-risk repository boundary without migrating auth or core chat data yet.
5. Make live session creation transport-aware behind `LIVE_TRANSPORT_DEFAULT=hls`, preserving old HLS clients by default.

## PR 1: CDK and Infrastructure Hardening

Tighten the initial CDK scaffold into an explicit dev/prod foundation.

Deliverables:

- Add stack outputs for the key values later services need:
  - VPC ID and private subnet IDs;
  - media, live, and frontend bucket names;
  - DynamoDB WebSocket connection table name;
  - Aurora cluster endpoint and secret ARN;
  - ECS cluster name;
  - ECR repository URIs;
  - HTTP API and WebSocket API IDs/endpoints;
  - CloudFront distribution ID.
- Add least-privilege grants for planned service roles:
  - API: read database secret, read/write media metadata buckets where needed, read live playback objects only where needed.
  - Worker: read database secret, read/write live and media buckets, DynamoDB cleanup access.
  - Realtime: DynamoDB connection table read/write and API Gateway Management API fanout permissions.
  - Build projects: push only to their assigned ECR repositories and write only the frontend artifact bucket where applicable.
- Replace placeholder service definitions with deployable placeholder tasks that have stable health checks and environment variables but `desiredCount: 0`.
- Keep LiveKit networking as documented scaffolding; do not claim production-ready UDP/NLB routing until a later LiveKit networking pass validates it.
- Add CDK assertions for:
  - dev region `us-east-2`;
  - prod region `us-east-1`;
  - stateful prod resources retained;
  - DynamoDB TTL enabled;
  - ECR repositories created for all service images;
  - GitHub OIDC trust limited to the configured owner/repo;
  - service task roles do not receive wildcard admin permissions.

Acceptance criteria:

- `pnpm --filter rebound-cdk build` passes.
- `pnpm --filter rebound-cdk test` passes.
- `pnpm --filter rebound-cdk synth:dev` passes.
- `pnpm --filter rebound-cdk synth:prod` passes.
- No production workflow, PM2, Nginx, or EC2 deployment file is changed.

## PR 2: Container and Build Artifact Scaffolding

Add Docker/build artifacts for the planned services without using them in production yet.

Deliverables:

- Add Docker build definitions for:
  - `api`: Express HTTP API process.
  - `worker`: cleanup and background job process.
  - `realtime`: future WebSocket route handler process.
  - `livekit`: LiveKit config/task artifact.
  - `web-build`: Vite static asset build.
- Expand `infra/buildspec.api.yml`, `infra/buildspec.worker.yml`, `infra/buildspec.frontend.yml`, and `infra/buildspec.livekit.yml` from placeholders into dry-run-capable build specs.
- Add task definition and AppSpec templates under `infra/taskdefs/` and `infra/codedeploy/` for API, worker, realtime, and LiveKit.
- Add local commands or documented commands for building each image.
- Do not push images, create deployments, or replace `.github/workflows/deploy-new.yml` in this slice.

Build defaults:

- Use Node 22 images for Node services.
- Use pnpm through Corepack.
- Run `pnpm install --frozen-lockfile` in CI-oriented builds.
- Keep server tests as a pre-build gate for `api`.
- Keep frontend `pnpm run build` as the pre-upload gate for `web-build`.

Acceptance criteria:

- Each Docker build can run locally.
- Buildspecs are syntactically valid YAML and reference the correct package scripts.
- Existing `pnpm run build` still succeeds.
- Existing `pnpm --prefix server test` still succeeds.

## PR 3: Runtime Split for API and Worker

Refactor server startup so one backend process no longer owns every runtime responsibility.

Target behavior:

- API mode binds HTTP routes and health endpoints.
- Worker mode runs cleanup/background jobs without binding HTTP.
- Realtime mode is stubbed for future API Gateway WebSocket handlers and does not start Socket.IO by default.
- Existing local development can still start the current combined behavior until the new modes are wired into developer scripts.

Implementation direction:

- Extract Express app construction from `server/src/app.js` into a reusable app factory.
- Keep the current production entrypoint behavior compatible.
- Move live cleanup interval ownership out of API mode and into worker mode.
- Add health endpoints:
  - API: `/healthz` returns process and dependency-light health.
  - Worker: expose a lightweight health command or HTTP health endpoint only if the worker binds a port.
- Add explicit mode selection using `SERVER_ROLE=api|worker|combined|realtime`.
- Default local behavior remains `combined` unless the caller sets `SERVER_ROLE`.

Acceptance criteria:

- API can start without Socket.IO and without the live cleanup interval.
- Worker can run live cleanup without binding the product HTTP API.
- Combined mode preserves current development behavior.
- Server tests cover role selection and cleanup ownership.

## PR 4: Prisma Schema Draft and First Repository Boundary

Introduce Prisma for Aurora PostgreSQL without migrating the application yet.

Deliverables:

- Add Prisma dependencies and scripts under `server/`.
- Add `server/prisma/schema.prisma` with initial draft models for low-risk live/session metadata:
  - stream sessions;
  - stream assets;
  - stream participants or telemetry summaries if needed for WebRTC readiness.
- Add `server/src/data/prismaClient.js` with lazy client construction.
- Add a repository boundary for stream-session reads/writes that can support Mongo today and Prisma later.
- Keep Mongoose as the active backing store for current production behavior.
- Add a clear migration note explaining that auth, users, chat, DMs, friends, and media are not migrated in this PR.

Defaults:

- `DATABASE_URL` is required only when Prisma-backed code paths are enabled.
- Tests should not require a real Aurora instance.
- Use repository-level tests with mocks or local SQLite only if Prisma schema compatibility makes that practical without changing production semantics.

Acceptance criteria:

- Existing server tests do not require PostgreSQL.
- New repository tests prove the boundary can map current stream-session fields into the transport-aware shape.
- No login/auth behavior changes.
- No GridFS behavior changes.

## PR 5: Transport-Aware Live Session Response Behind HLS Default

Extend live session creation so it can describe HLS, WebRTC, or hybrid transport while defaulting to the existing HLS behavior.

Configuration:

- Add `LIVE_TRANSPORT_DEFAULT=hls|webrtc|hybrid`.
- Default to `hls` when the variable is missing or invalid.
- Add placeholder config keys for later WebRTC work:
  - `LIVEKIT_URL`;
  - `LIVEKIT_API_KEY`;
  - `LIVEKIT_API_SECRET`;
  - `LIVEKIT_WEBHOOK_SECRET`;
  - `S3_LIVE_BUCKET`;
  - `S3_MEDIA_BUCKET`;
  - `AWS_REGION`;
  - `APP_ENV`.

Response behavior:

- Existing HLS clients still receive the fields they currently need.
- New clients may read a transport-aware envelope:
  - `transport`;
  - `control`;
  - `ingest`;
  - `playback`;
  - `shareUrl`.
- In `hls` mode, WebRTC fields are omitted or marked unavailable; no fake LiveKit token is minted.
- In `webrtc` or `hybrid` mode, return a not-ready or disabled WebRTC shape until PR 6 adds real LiveKit token minting.
- Preserve current HLS ingest/upload/playback routes.

Acceptance criteria:

- `LIVE_TRANSPORT_DEFAULT=hls` preserves existing tests and current client behavior.
- Invalid transport config falls back to HLS with a server-side warning.
- Tests cover HLS default, invalid config fallback, and advertised hybrid/webrtc envelope shape.
- No browser player change is required in this PR.

## PR 6: LiveKit Token Layer Design Stub

Prepare the server module layout for real LiveKit token issuance, but do not make it the default path yet.

Deliverables:

- Add `server/src/live/webrtc/` modules:
  - `config.js`;
  - `tokens.js`;
  - `sessionMapper.js`;
  - `webhooks.js`;
  - `iceServers.js`.
- Add tests for token role intent using deterministic stubs if LiveKit SDK dependency is not added yet.
- Define publisher and viewer permission rules:
  - publisher tokens are scoped to one session room and publishing;
  - viewer tokens are scoped to one session room and subscribing;
  - tokens are short-lived;
  - no token grants access to arbitrary rooms.
- Keep session creation in HLS mode by default.

Acceptance criteria:

- Token modules can be imported without requiring LiveKit env vars in HLS mode.
- Missing LiveKit config only fails when WebRTC token generation is explicitly requested.
- Tests lock room naming and role boundaries.

## Cross-Cutting Test Strategy

Run these checks before finalizing each PR where relevant:

- `pnpm run test:streaming`
- `pnpm run test:sources`
- `pnpm --prefix server test`
- `pnpm --filter rebound-cdk build`
- `pnpm --filter rebound-cdk test`
- `pnpm --filter rebound-cdk synth:dev`
- `pnpm --filter rebound-cdk synth:prod`
- `pnpm run build`

Additional checks:

- Use `pnpm run probe:ffmpeg-webrtc` when changing WHIP, codec, or FFmpeg capability code.
- Use `aws sts get-caller-identity` and `aws configure get region` only for read-only AWS sanity checks unless deployment work is explicitly requested.

## Non-Goals for Master Plan 02

- Do not deploy AWS resources.
- Do not replace the existing EC2 deployment workflow.
- Do not migrate users, auth, chat, DMs, friends, or GridFS media to PostgreSQL/S3 yet.
- Do not remove Socket.IO.
- Do not make WebRTC the default live transport.
- Do not remove or degrade HLS ingest, playback, uploader, or adaptation behavior.
- Do not wire the browser viewer to LiveKit yet.

## Completion Criteria

Master Plan 02 is complete when:

- The CDK foundation is synthable, tested, and output-rich enough for a later dev deploy.
- Docker/build scaffolding exists for all planned runtime services.
- The server can run API and worker responsibilities independently.
- Prisma exists as a draft data layer behind a repository boundary with no production migration.
- Live session creation can advertise transport-aware metadata while HLS remains the default and backward-compatible behavior.
- All listed tests pass, or any skipped test is documented with a concrete blocker.
