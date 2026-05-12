# Master Plan 00: AWS-Native WebRTC Streaming and Platform Migration

This plan combines `plans/00-plan-0.md` and `plans/00-plan-1.md` into one execution plan grounded in the current repository. It replaces the "media-server candidate" framing from plan 0 with the AWS-native baseline from plan 1: LiveKit on ECS Fargate is the selected SFU, Aurora PostgreSQL is the target database, S3 is the durable object store, API Gateway WebSockets replace Socket.IO, and CDK v2 TypeScript owns the AWS estate.

The core product direction remains unchanged: WebRTC becomes the primary live transport; HLS remains as fallback, recording, and rollback path until production telemetry proves WebRTC is healthy.

## Current Codebase Snapshot

Verified against the repository on 2026-05-12.

### Frontend and Desktop App

- The root app is a Vite/React/Electron app using ESM and pnpm. The relevant scripts are in `package.json`.
- The desktop broadcaster is currently concentrated in `public/electron-live-stream.js`.
- FFmpeg argument composition is split under `public/streaming/`, with `public/streaming/pipeline.js` composing capture, filter, encoder, audio, and HLS output.
- HLS output is built by `public/streaming/output/hls.js`; there is no WHIP/WebRTC output module yet.
- The desktop stream UI lives in `src/routes/DesktopLivePage/DesktopLivePage.route.jsx` and currently exposes HLS settings directly.
- The streamer status surface lives in `src/features/streaming/ui/panels/LiveStatusPanel.jsx` and shows HLS-driven viewer capability, recommendation, and respawn state.
- The viewer player is `src/components/Live/LiveStreamPlayer.jsx`; it is HLS-first, uses `hls.js`, and assumes `stream.playbackUrl` is a playlist URL.
- The viewer live-control hook is `src/features/player/useLiveControlClient.js`; it connects through Socket.IO and reports HLS/network capability data.

### Server

- The server is an Express 5 ESM app started from `server/src/app.js`.
- `server/src/app.js` currently starts HTTP, MongoDB, live cleanup runtime, and the Socket.IO side service from one backend process.
- `server/src/live/runtime.js` owns an in-process interval for live session cleanup.
- `server/src/routes/live.js` owns all current live REST routes:
  - `POST /live/api/session`
  - HLS ingest PUT routes for playlists and segments
  - heartbeat and end-session routes
  - authenticated share, stream list, and HLS playback routes
- `server/src/live/service.js` creates HLS sessions, validates ingest secrets, stores HLS asset metadata, updates heartbeats, serves share summaries, and cleans expired storage.
- `server/src/models/StreamSession.js` is a Mongoose model with HLS-specific fields: `playbackPath`, `sharePath`, `storageBackend`, `storagePrefix`, `recentSegmentNames`, and `assets`.
- `server/src/live/storage.js` already has a local adapter and an S3 adapter shape, but `server/package.json` does not currently declare `@aws-sdk/client-s3` directly. The S3 path is therefore not production-ready as-is.

### Realtime

- General realtime chat/presence currently uses Socket.IO in `server/src/socketio/index.js`, `server/src/socketio/rooms.js`, `server/src/socketio/dms.js`, and `server/src/socketio/watchers.js`.
- Live stream control uses the Socket.IO namespace `/live-control` in `server/src/live/control/socket.js`.
- The shared live-control message contract is `shared/streaming/protocol.js`, currently at `PROTOCOL_VERSION = 1`.
- The frontend generic Socket.IO client helper is `src/helpers/socketClient.js`.
- API Gateway WebSocket APIs are not Socket.IO-compatible; this is a true protocol migration, not a hosting swap.

### Data and Media

- MongoDB/Mongoose is the canonical database today. The bootstrap is in `server/src/database/index.js`.
- Development and tests use `mongodb-memory-server`; production URI construction assumes MongoDB on localhost.
- Current Mongoose entities include `User`, `Server`, `RoomGroup`, `Room`, `Message`, `DmThread`, `Friend`, `ServerInvite`, `StreamSession`, and `MediaAttachment`.
- Binary uploads currently use GridFS through `databaseServer.gridfsBucket`.
- Media upload routes are in `server/src/routes/api/media.js`; content download uses `server/src/routes/content.js`.
- User profile/banner upload code also relies on GridFS through `server/src/routes/api/users.js`.

### Deployment

- Current production deployment is a GitHub Actions SSH workflow in `.github/workflows/deploy-new.yml`.
- That workflow builds the Vite app, copies static files to `/var/www/html`, writes a server `.env`, installs server dependencies on an EC2 host, restarts PM2, and updates Nginx.
- `server/ecosystem.config.cjs` runs one PM2 app named `rebound-express`.
- `server/nginx/default` proxies Express on `6001`, Socket.IO on `6002`, and serves the SPA from local disk.
- There is no `cdk/` app, Dockerfile, ECR/CodeBuild/CodeDeploy artifact, Prisma schema, LiveKit config, or API Gateway WebSocket handler yet.

### Existing Test Coverage

- Server tests use Mocha through `server/package.json` with `pnpm --prefix server test`.
- Live HLS route behavior is covered by `server/test/live.routes.test.js`.
- Live-control recommender/session/store behavior is covered under `server/test/live/control/`.
- Streaming pipeline and uploader tests are under `public/streaming/__tests__/` and `public/streaming/uploader/__tests__/`.
- Playwright E2E tests include basic live route/auth states in `tests/e2e/streaming.spec.js`.
- The existing test suite is HLS and Socket.IO oriented; it needs WebRTC, LiveKit-token, API Gateway WebSocket, Aurora, S3, CDK, and deployment coverage added.

## Target Architecture

### Hosting and Infrastructure

- Production region: `us-east-1`.
- Development region: `us-east-2`.
- CDK v2 TypeScript app lives in `cdk/` and owns AWS resources through CloudFormation.
- React/Vite static assets are hosted from S3 behind CloudFront.
- Runtime services run on ECS Fargate.
- Aurora PostgreSQL on RDS becomes the canonical application database.
- S3 stores user uploads, media attachments, live HLS fallback/recording artifacts, frontend build artifacts, and deployment bundles.
- API Gateway HTTP APIs front product HTTP routes where appropriate.
- API Gateway WebSocket APIs replace Socket.IO for chat, presence, watchers, and live-control messages.
- LiveKit runs as the selected SFU on ECS Fargate with Redis in ElastiCache and load balancers for signaling and media.
- WebRTC media never flows through API Gateway, Express, CloudFront, or the existing Nginx HTTP proxy model.

### Media Plane

Target primary live path:

```text
Electron broadcaster -> LiveKit WebRTC/WHIP ingest -> LiveKit SFU -> browser viewers
```

Target fallback/recording path:

```text
LiveKit egress or broadcaster-side HLS -> S3 live bucket -> authenticated HLS playback
```

The preferred MVP ingest is FFmpeg WHIP into LiveKit if the bundled FFmpeg and LiveKit configuration support it cleanly. If that compatibility fails, use LiveKit-supported ingress or a native WebRTC publisher path in Electron.

The preferred MVP playback is LiveKit's browser SDK. WHEP can be supported later as an interoperability surface, but the app should not block the AWS migration on WHEP.

### Control Plane

Rebound remains responsible for:

- auth and account/session limits;
- stream discovery and share pages;
- short-lived publisher/viewer LiveKit tokens;
- short-lived ICE/TURN configuration if not fully handled by LiveKit;
- chat, presence, watchers, and live-control product messages;
- moderation, stream metadata, telemetry, and audit logs;
- cleanup of application session state, LiveKit rooms, S3 fallback objects, and stale WebSocket connections.

### Data Plane

The Express API should stop receiving live video bytes for the primary path. HLS upload routes may remain temporarily for fallback, but the main WebRTC path is LiveKit media over WebRTC transports exposed through the media load-balancer topology.

## Architecture Decisions

1. LiveKit is the selected SFU baseline.
   The earlier LiveKit-vs-mediasoup spike becomes a narrower LiveKit compatibility spike: validate FFmpeg WHIP ingest, browser playback, stats, shutdown, and AWS networking. Do not spend full implementation time on mediasoup unless LiveKit fails a critical gate.

2. Use H.264 plus Opus for the WebRTC MVP.
   Current desktop defaults prefer HEVC/AAC for HLS efficiency, but browser/SFU compatibility pushes the WebRTC MVP toward H.264 video and Opus audio. HEVC remains advanced or Safari-specific.

3. Single-layer WebRTC is acceptable for the MVP.
   Single-layer WHIP lowers latency but does not provide per-viewer adaptation. Simulcast/SVC or a transcoding ladder comes after telemetry proves the need.

4. API Gateway WebSockets replace Socket.IO.
   This requires a new route-keyed JSON protocol and connection-state storage. Existing Socket.IO event names should be mapped intentionally rather than tunneled.

5. Use Prisma for Aurora PostgreSQL unless a better project-local decision is made before implementation.
   The current server has no relational data layer. Prisma gives schema, migrations, typed client generation, and test fixtures with the least custom work.

6. Use DynamoDB for ephemeral WebSocket connection state.
   Connection IDs, subscriptions, presence fanout indexes, and TTL cleanup are better suited to DynamoDB than Aurora unless a later design proves otherwise.

7. Keep the current EC2/PM2/Nginx deployment until AWS dev is deployable.
   The migration should introduce CDK and AWS deployment alongside the existing path, then cut over after dev validation.

## Non-Goals

- Do not build a custom SFU.
- Do not use P2P mesh for live streams.
- Do not proxy RTP/SRTP media through Express, API Gateway, CloudFront, or Nginx HTTP locations.
- Do not remove HLS until WebRTC has production telemetry, fallback behavior, and rollback coverage.
- Do not add mobile broadcasting in this rewrite; mobile remains viewer-only.
- Do not migrate the Electron release workflow into ECS. Keep desktop packaging in `.github/workflows/build-electron.yml`, updating it only where WebRTC/FFmpeg assets require it.

## Target API Shapes

### Session Creation

`POST /live/api/session` remains the product session creation entrypoint, but its response becomes transport-aware.

```json
{
  "sessionId": "abc",
  "publicToken": "public",
  "status": "active",
  "transport": "webrtc",
  "control": {
    "protocol": "api-gateway-websocket",
    "endpoint": "wss://ws.dev.rebound.nexus",
    "sessionId": "abc"
  },
  "ingest": {
    "provider": "livekit",
    "protocol": "whip-or-livekit",
    "roomName": "live_abc",
    "endpoint": "https://rtc.dev.rebound.nexus",
    "token": "short-lived-publisher-token",
    "iceServers": []
  },
  "playback": {
    "provider": "livekit",
    "protocol": "livekit-sdk",
    "roomName": "live_abc",
    "endpoint": "wss://rtc.dev.rebound.nexus",
    "token": "short-lived-viewer-token",
    "hlsFallbackUrl": "https://media.dev.rebound.nexus/live/sessions/abc/master.m3u8"
  },
  "shareUrl": "https://dev.rebound.nexus/live/share/public"
}
```

### New or Changed Live Endpoints

- Keep `POST /live/api/session`, adding `transport` negotiation and feature-flag defaults.
- Add `POST /live/api/:sessionId/webrtc/ingest-token` for publisher token refresh.
- Add `POST /live/api/share/:publicToken/webrtc/viewer-token` for viewer token minting.
- Add `GET /live/api/:sessionId/ice-servers` if LiveKit/TURN configuration is not embedded in LiveKit tokens/config.
- Add `POST /live/api/:sessionId/webrtc/events` or a dedicated webhook route for signed LiveKit room/participant events.
- Preserve current HLS playback routes during fallback migration, then move backing storage to S3.

### WebSocket Envelope

The replacement for Socket.IO should use a stable envelope:

```json
{
  "route": "live.viewerStats",
  "protocolVersion": 2,
  "requestId": "optional-client-id",
  "sessionId": "abc",
  "payload": {}
}
```

Connection behavior:

- authenticate on `$connect`;
- store connection ID, user ID, connection role, subscriptions, and TTL in DynamoDB;
- route chat, presence, watchers, live-control, viewer stats, streamer stats, and disconnect cleanup through explicit route keys;
- use API Gateway Management API for server-to-client fanout.

## Target Data Model

Aurora PostgreSQL replaces Mongoose. Preserve stable public identifiers where clients depend on them.

Core tables to model first:

- users, auth tokens/sessions, device sessions, OAuth identities;
- servers, room groups, rooms, messages;
- DM threads and memberships;
- friends;
- server invites;
- media attachments and S3 object metadata;
- stream sessions, stream assets, stream participants, stream telemetry summaries;
- optional audit/event tables for auth, media, live room events, and moderation.

`StreamSession` needs transport-aware fields instead of HLS-only state:

```text
transport: hls | webrtc | hybrid
status: active | ended | expired
publicToken
createdByUserId
mediaServerProvider: livekit
mediaRoomName
mediaNodeId
mediaRegion
publisherConnectedAt
publisherDisconnectedAt
lastMediaEventAt
hlsFallbackEnabled
hlsPlaybackPath
storagePrefix
```

Do not overload the current `assets` array with WebRTC state. Model HLS assets as their own rows or JSON payload depending on query needs, and model WebRTC telemetry separately.

## Implementation Phases

### Phase 0: Architecture Hardening and Local Compatibility

Deliverables:

- Create an ADR under `plans/` or `docs/` that locks the baseline: AWS, LiveKit, Aurora PostgreSQL, S3, API Gateway WebSockets, ECS Fargate, CDK v2 TypeScript.
- Build a local LiveKit proof of concept that accepts one publisher and two browser viewers.
- Probe the bundled FFmpeg with `-hide_banner -muxers` or `-hide_banner -h muxer=whip` on each Electron build target.
- Validate FFmpeg WHIP to LiveKit. If WHIP fails, document the chosen fallback: LiveKit ingress or native Electron WebRTC publisher.
- Decide whether HLS fallback is generated by LiveKit egress or by the broadcaster in parallel.
- Decide local-dev shape: Docker Compose for LiveKit/Redis/Postgres/LocalStack or separate scripts.

Exit criteria:

- A developer can run the selected local media stack with one command.
- One test publisher reaches two local browser viewers.
- The plan has a clear answer for MVP codec, ingest method, HLS fallback generation, and local test strategy.

### Phase 1: AWS/CDK Foundation

Deliverables:

- Add `cdk/` with a TypeScript CDK v2 app.
- Add environment context for `dev` in `us-east-2` and `prod` in `us-east-1`.
- Add stacks:
  - `NetworkStack`: VPC, public/private/isolated subnets, NAT, security groups, endpoints.
  - `DataStack`: Aurora PostgreSQL, Secrets Manager, S3 media/live/frontend buckets, ElastiCache Redis, DynamoDB WebSocket connection table.
  - `ComputeStack`: ECS cluster, Fargate task definitions/services, ECR repos, CloudWatch logs.
  - `ApiStack`: HTTP API, WebSocket API, custom domains, stages, throttling, access logs.
  - `FrontendStack`: S3 asset bucket, CloudFront distribution, ACM certificates, Route53 records.
  - `PipelineStack`: CodeBuild projects, CodeDeploy apps/groups, GitHub OIDC IAM role.
- Add CDK tests and `cdk synth` scripts for dev/prod.

Exit criteria:

- `pnpm` scripts can synth dev and prod.
- CDK tests cover region-specific config, IAM trust, buckets, Aurora, ECS, WebSocket API, and LiveKit load balancers.
- Existing EC2 deployment remains untouched until AWS dev deploy succeeds.

### Phase 2: Container and Runtime Split

Deliverables:

- Add Docker build artifacts for:
  - `api`: Express HTTP service.
  - `realtime`: API Gateway WebSocket route handler service.
  - `worker`: cleanup, migrations, media jobs, stream lifecycle cleanup.
  - `livekit`: LiveKit service/config image or task definition.
  - `web-build`: build job/image for static Vite assets.
- Split `server/src/app.js` startup responsibilities so API, worker, and realtime handlers can start independently.
- Move `server/src/live/runtime.js` cleanup work out of the API process and into the worker.
- Add health endpoints for ECS target groups.
- Add buildspecs and task definition/AppSpec templates.

Exit criteria:

- Each service can be built locally.
- API can run without starting Socket.IO or the live cleanup interval.
- Worker can run cleanup without binding HTTP.
- CodeBuild can build and push images to ECR in dev.

### Phase 3: Aurora PostgreSQL and S3 Migration

Deliverables:

- Add Prisma schema and migration setup.
- Create repository/service boundaries so routes stop importing Mongoose models directly over time.
- Migrate entities in this order:
  1. users/auth/device sessions;
  2. servers, room groups, rooms;
  3. messages and media attachment metadata;
  4. DM threads and friends;
  5. server invites;
  6. stream sessions and live assets.
- Implement GridFS-to-S3 export for:
  - media attachments from `server/src/routes/api/media.js`;
  - avatar/banner uploads from `server/src/routes/api/users.js`;
  - any objects served by `server/src/routes/content.js`.
- Replace live HLS fallback storage with S3-backed storage and add direct dependency on the needed AWS SDK packages.
- Keep MongoDB read-only during validation, then cut over writes to Aurora.

Exit criteria:

- Representative Mongo fixtures migrate to PostgreSQL rows and S3 objects.
- Routes can read migrated data from Aurora.
- Media URLs remain stable or redirect cleanly.
- Server tests no longer require MongoDB for migrated modules.

### Phase 4: API Gateway WebSocket Migration

Deliverables:

- Define `shared/realtime/protocol.js` or version `shared/streaming/protocol.js` into a broader realtime envelope.
- Replace `src/helpers/socketClient.js` with an API Gateway WebSocket client abstraction.
- Replace server Socket.IO listeners from:
  - `server/src/socketio/rooms.js`;
  - `server/src/socketio/dms.js`;
  - `server/src/socketio/watchers.js`;
  - `server/src/live/control/socket.js`.
- Add `$connect`, `$disconnect`, chat, presence, watcher, live-control, viewer-stats, and streamer-stats route handlers.
- Store WebSocket connection state in DynamoDB with TTL cleanup.
- Implement fanout through API Gateway Management API.

Exit criteria:

- Chat, DMs, room presence, watchers, and live-control work without Socket.IO in dev.
- Existing Socket.IO behavior has mapped tests or explicit deprecation notes.
- WebSocket auth failures, stale connection cleanup, and fanout retries are tested.

### Phase 5: LiveKit Session and Token Layer

Deliverables:

- Add `server/src/live/webrtc/`:
  - `config.js`;
  - `livekitClient.js`;
  - `tokens.js`;
  - `iceServers.js`;
  - `sessionMapper.js`;
  - `webhooks.js`.
- Extend session creation to create or map a LiveKit room.
- Mint role-scoped publisher and viewer tokens.
- Add signed LiveKit webhook handling for room, participant, and track events.
- Add `LIVE_TRANSPORT_DEFAULT=hls|webrtc|hybrid`.
- Add service config:
  - `LIVEKIT_URL`;
  - `LIVEKIT_API_KEY`;
  - `LIVEKIT_API_SECRET`;
  - `LIVEKIT_REDIS_URL` or task-level LiveKit config;
  - `S3_LIVE_BUCKET`;
  - `S3_MEDIA_BUCKET`;
  - `AWS_REGION`;
  - `APP_ENV`.

Exit criteria:

- Session responses are transport-aware.
- Viewer tokens cannot publish.
- Publisher tokens cannot view or publish arbitrary sessions.
- Ending a session tears down LiveKit room state or revokes access according to LiveKit behavior.
- Existing HLS route tests still pass under `LIVE_TRANSPORT_DEFAULT=hls`.

### Phase 6: Electron Broadcaster Transport Rewrite

Deliverables:

- Split `public/electron-live-stream.js` into smaller modules:
  - `public/streaming/manager/ElectronLiveStreamManager.js`;
  - `public/streaming/manager/ffmpegProcess.js`;
  - `public/streaming/manager/sessionClient.js`;
  - `public/streaming/manager/mediaStats.js`.
- Add transport modules:
  - `public/streaming/transports/hlsTransport.js`;
  - `public/streaming/transports/whipTransport.js`;
  - `public/streaming/transports/transportState.js`.
- Add `public/streaming/output/whip.js` for pure WHIP FFmpeg args.
- Keep `public/streaming/output/hls.js` as the fallback output builder.
- Update `public/streaming/pipeline.js` so output selection is injected rather than hard-coded to HLS.
- Add FFmpeg WHIP capability probing to `public/streaming/capabilities/probe.js`.
- Update `src/routes/DesktopLivePage/DesktopLivePage.route.jsx` to offer transport mode: auto, WebRTC only, HLS only.
- Default WebRTC MVP to H.264 plus Opus; keep current HEVC/AAC HLS settings for fallback.

Exit criteria:

- Electron can publish test source or desktop capture into LiveKit in dev.
- Stop tears down FFmpeg and publisher state.
- HLS-only mode still uses the current uploader path.
- Failure messages identify auth, FFmpeg capability, LiveKit connection, ICE/DTLS, and fallback causes.
- Streaming unit tests cover WHIP argv, capability fallback, transport state, and HLS preservation.

### Phase 7: Viewer Transport Rewrite

Deliverables:

- Move player code toward:
  - `src/features/player/LiveStreamPlayer.jsx`;
  - `src/features/player/transports/WebRtcPlayer.jsx`;
  - `src/features/player/transports/HlsPlayer.jsx`;
  - `src/features/player/transports/transportPicker.js`;
  - `src/features/player/hooks/useWebRtcPlayback.js`;
  - `src/features/player/hooks/useWebRtcStats.js`;
  - `src/features/player/hooks/useHlsPlayback.js`;
  - `src/features/player/hooks/useLiveControlClient.js`.
- Use LiveKit browser SDK for WebRTC playback.
- Fetch viewer token from the share/session API.
- Prefer WebRTC when advertised and supported.
- Fall back to HLS when WebRTC is disabled, unsupported, blocked, or fails connection within a defined timeout.
- Update `src/routes/LiveSharePage/LiveSharePage.route.jsx` and `src/routes/AvailableStreamsPage/AvailableStreamsPage.route.jsx` so they do not assume `playbackUrl` is always an HLS playlist.
- Replace HLS-specific waiting/copy text with transport-aware UI.

Exit criteria:

- Two browser viewers can watch one LiveKit session.
- Closing one viewer does not affect the other.
- WebRTC failure falls back to HLS when fallback is available.
- HLS-only sessions still play through the fallback player.
- Playwright smoke tests cover unauthenticated states, HLS fallback, and WebRTC connected state in dev.

### Phase 8: WebRTC Stats, Control, and Adaptation

Deliverables:

- Version the live-control protocol to include WebRTC viewer and streamer stats.
- Add stats summaries for:
  - ICE candidate pair type;
  - relay ratio;
  - RTT;
  - jitter;
  - packets lost;
  - frames decoded/dropped;
  - freezes/stalls where exposed;
  - inbound bitrate;
  - available incoming bitrate where exposed;
  - audio concealment where exposed.
- Add server-side aggregation beside or replacing `viewerStore`.
- Make `server/src/live/control/recommender.js` transport-aware:
  - HLS sessions can keep current lower-only respawn logic.
  - WebRTC single-layer sessions should recommend publisher ceilings only when many viewers are failing.
  - Simulcast/SVC sessions should rely on LiveKit layer selection.
- Update `LiveStatusPanel` to show publisher connection, LiveKit room/node, viewer count, relay ratio, bitrate, packet loss, and RTT summary.

Exit criteria:

- WebRTC sessions show useful stats without HLS.js.
- HLS sessions preserve existing adaptation history.
- Viewer UI explains connection/adaptation state without exposing internal transport jargon.
- Server tests cover WebRTC stats aggregation and transport-aware recommendations.

### Phase 9: HLS Fallback, Recording, and Cleanup

Deliverables:

- Implement the fallback generation decision from phase 0:
  - LiveKit egress to S3, or
  - broadcaster-side dual output with current uploader retained only for fallback.
- Move fallback playback storage to S3 and CloudFront/media domain where appropriate.
- Add session-level transport selection: auto, WebRTC only, HLS only.
- Add cleanup for:
  - LiveKit rooms;
  - S3 fallback prefixes;
  - stale Aurora stream sessions;
  - stale DynamoDB WebSocket connections;
  - TURN/relay observability.

Exit criteria:

- Production can disable WebRTC with one env var.
- HLS-only users can still watch.
- WebRTC sessions do not leave orphan LiveKit rooms or stale DB/session rows.
- Cleanup runs from the worker, not the API server.

### Phase 10: AWS CI/CD Cutover

Deliverables:

- Replace `.github/workflows/deploy-new.yml` with GitHub OIDC to AWS.
- GitHub Actions assumes an IAM role with no long-lived AWS keys.
- GitHub triggers environment-specific CodeBuild projects.
- CodeBuild runs tests, builds Docker images, pushes to ECR, builds frontend assets, and emits deployment artifacts.
- CodeDeploy updates ECS services using generated task definitions and AppSpec files.
- CloudFront invalidations are issued for frontend deploys.
- Database migrations run as controlled deploy steps or separate reviewed jobs.
- Keep `.github/workflows/build-electron.yml` for desktop packaging, adding WHIP/FFmpeg validation where needed.

Exit criteria:

- Dev deploy in `us-east-2` is repeatable from GitHub.
- ECS services roll forward and back through CodeDeploy.
- Frontend deploys reach CloudFront.
- Production `us-east-1` cutover has documented rollback to the old EC2 path until final retirement.

### Phase 11: Production Validation and Rollout

Deliverables:

- Run staging/dev validation:
  - one publisher, two viewers;
  - cellular viewer;
  - restrictive network/TURN path;
  - streamer stop/reconnect;
  - viewer refresh during publisher reconnect;
  - WebRTC disabled by feature flag.
- Add CloudWatch metrics and alarms:
  - ECS task health;
  - deployment failures;
  - NLB/ALB target health;
  - LiveKit room/session metrics;
  - TURN relay ratio;
  - API Gateway WebSocket connection counts/errors;
  - Aurora connections/CPU/latency;
  - Redis health;
  - S3/CloudFront errors;
  - WebRTC startup latency and fallback rate.
- Define rollout:
  - internal dev;
  - small account allowlist;
  - default hybrid;
  - default WebRTC;
  - HLS route retirement only after a separate decision.

Exit criteria:

- Production can run WebRTC-first with HLS fallback.
- p95 startup and fallback rates are visible.
- Operators can roll back through feature flags and CodeDeploy.
- Old EC2/PM2/Nginx deploy is retired only after AWS production has proven stable.

## Code Organization Targets

### Server

```text
server/src/data/
  prismaClient.js
  repositories/

server/src/live/webrtc/
  config.js
  livekitClient.js
  tokens.js
  iceServers.js
  sessionMapper.js
  webhooks.js

server/src/live/control/
  protocolMapper.js
  controlSession.js
  webRtcStatsStore.js
  recommender.js

server/src/realtime/
  routes/
  connectionStore.js
  fanout.js
  auth.js

server/src/worker/
  index.js
  liveCleanup.js
  mediaMigration.js
```

### Desktop Streaming

```text
public/streaming/output/
  hls.js
  whip.js
  index.js

public/streaming/transports/
  hlsTransport.js
  whipTransport.js
  transportState.js

public/streaming/manager/
  ElectronLiveStreamManager.js
  ffmpegProcess.js
  sessionClient.js
  mediaStats.js
```

### Frontend Player

```text
src/features/player/
  LiveStreamPlayer.jsx
  transports/
    WebRtcPlayer.jsx
    HlsPlayer.jsx
    transportPicker.js
  hooks/
    useWebRtcPlayback.js
    useWebRtcStats.js
    useHlsPlayback.js
    useLiveControlClient.js
  overlays/
    ConnectionStateOverlay.jsx
    PlaybackErrorOverlay.jsx
    AdaptationToast.jsx
```

### Infrastructure

```text
cdk/
  bin/
  lib/
    network-stack.ts
    data-stack.ts
    compute-stack.ts
    api-stack.ts
    frontend-stack.ts
    pipeline-stack.ts
  test/

infra/
  buildspec.api.yml
  buildspec.worker.yml
  buildspec.frontend.yml
  buildspec.livekit.yml
  codedeploy/
  taskdefs/
  livekit/
```

## Configuration Targets

Shared/service config:

- `APP_ENV=dev|prod|test|local`
- `AWS_REGION`
- `DATABASE_URL`
- `S3_MEDIA_BUCKET`
- `S3_LIVE_BUCKET`
- `S3_FRONTEND_BUCKET`
- `CLOUDFRONT_DISTRIBUTION_ID`

Realtime config:

- `API_GATEWAY_WEBSOCKET_ENDPOINT`
- `WEBSOCKET_CONNECTION_TABLE`
- `WEBSOCKET_CONNECTION_TTL_SECONDS`

LiveKit/WebRTC config:

- `LIVE_TRANSPORT_DEFAULT=hls|webrtc|hybrid`
- `LIVEKIT_URL`
- `LIVEKIT_API_KEY`
- `LIVEKIT_API_SECRET`
- `LIVEKIT_WEBHOOK_SECRET`
- `LIVEKIT_REDIS_URL`
- `TURN_STATIC_AUTH_SECRET` only if external TURN credential minting is needed

Fallback HLS config:

- keep the existing `LIVE_*` retention and size settings where they still apply;
- replace `LIVE_S3_BUCKET` with `S3_LIVE_BUCKET` or map it during migration;
- keep local storage for tests/local fallback only.

## Test Strategy

### Existing Tests to Preserve

- `pnpm run test:streaming`
- `pnpm run test:sources`
- `pnpm --prefix server test`
- `pnpm run test:e2e`

### New Test Coverage

- CDK synth and assertion tests for dev/prod.
- Prisma migration and repository tests.
- Mongo-to-Postgres and GridFS-to-S3 migration fixture tests.
- API Gateway WebSocket route handler tests for connect, disconnect, auth failure, chat, presence, live-control, and fanout retries.
- LiveKit token tests for role scope, expiry, room isolation, and webhook signature validation.
- WHIP output argv and FFmpeg capability tests.
- WebRTC stats conversion tests.
- Transport picker tests for WebRTC preference and HLS fallback.
- Local LiveKit smoke test with one publisher and two viewers.
- CodeBuild dry-run/image build tests.
- CodeDeploy artifact validation tests.
- Dev environment deployment test in `us-east-2`.
- Rollback test before production cutover.

## Operational Risks

- FFmpeg WHIP support depends on the bundled FFmpeg build; probe every desktop target.
- LiveKit-on-Fargate media networking needs careful NLB, UDP port, advertised IP/domain, TLS, and autoscaling configuration.
- API Gateway WebSockets are not a Socket.IO host; all realtime clients and handlers must migrate.
- Migrating `passport-local-mongoose` user auth to Prisma can break login/session behavior if not staged carefully.
- GridFS-to-S3 migration must preserve existing media URLs or provide redirects.
- TURN relay can become the largest media cost under restrictive networks.
- Single-layer WebRTC can still force global quality compromises until simulcast/SVC or transcoding exists.
- In-process cleanup must move to a worker, or ECS task scaling will duplicate cleanup work.
- CodeDeploy blue/green may be constrained for services exposed through NLB/UDP; document per-service deployment strategy.

## First Pull Requests

1. Add ADR and local LiveKit compatibility spike docs/scripts.
2. Add CDK skeleton with dev/prod context and synth tests.
3. Add Docker/buildspec scaffolding without cutting over production.
4. Introduce Prisma schema draft and repository boundary for one low-risk model.
5. Add transport-aware live session response behind `LIVE_TRANSPORT_DEFAULT=hls`.
6. Add `public/streaming/output/whip.js` and tests without wiring it as default.
7. Add player transport picker and keep HLS as the only active transport.

This ordering keeps the existing HLS product usable while the AWS, data, realtime, and media-plane migrations come online behind flags.
