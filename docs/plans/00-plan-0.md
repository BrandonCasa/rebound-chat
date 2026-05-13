# Plan 0: WebRTC-first streaming rewrite

> This is the architecture plan that sits before Plans 01-06. It is different
> from "Phase 0" inside Plan 04, which is a code-quality/file-splitting phase.

## Status snapshot

Current state:

- The desktop app captures with FFmpeg in `public/electron-live-stream.js`.
- `public/streaming/pipeline.js` composes capture, filters, encoder, audio, and `public/streaming/output/hls.js`.
- Live media is emitted as fragmented MP4 HLS (`master.m3u8`, `video.m3u8`, `segment-*.m4s`).
- `public/streaming/uploader/` uploads playlists and segments into Express routes in `server/src/routes/live.js`.
- `server/src/live/service.js` stores session metadata and HLS assets in local/S3 storage.
- Viewers use `src/components/Live/LiveStreamPlayer.jsx` and HLS.js.
- `/live-control` over Socket.IO carries viewer capability telemetry and server-driven recommendations, but the actual media path is still HTTP HLS.

That architecture is workable, but it is not the standard shape for low-latency interactive live streaming. The industry-standard shape is:

```
Electron broadcaster -> WebRTC ingest -> SFU/media server -> WebRTC playback -> browser viewers
                         |                                  |
                         +-> TURN/STUN for NAT traversal     +-> stats/control telemetry
```

The Rebound app server remains the auth, discovery, session, and product-control layer. It should not become the media relay.

## Standards baseline

- WebRTC deliberately leaves application signaling unspecified; this is why production systems normally pair WebRTC with an app signaling/control plane and a dedicated media server.
- WHIP is now the standardized HTTP-based WebRTC ingest protocol: RFC 9725, published March 2025.
- WHEP is the matching playback protocol, but as of 2026-05-12 the current IETF draft (`draft-ietf-wish-whep-03`) is expired and still work in progress. Treat WHEP as useful interoperability shape, not a fully stable requirement.
- TURN is required for real-world NAT/firewall reliability. Use ephemeral credentials, not static credentials embedded in the app.
- One-to-many live streaming should use an SFU. Do not build P2P mesh for this product; viewer count and streamer uplink collapse immediately.

References checked:

- [RFC 9725: WebRTC-HTTP Ingestion Protocol (WHIP)](https://www.rfc-editor.org/rfc/rfc9725.html)
- [IETF WHEP draft](https://datatracker.ietf.org/doc/draft-ietf-wish-whep/)
- [WebRTC peer connections and ICE servers](https://webrtc.org/getting-started/peer-connections)
- [W3C WebRTC simulcast behavior](https://w3c.github.io/webrtc-pc/#simulcast-functionality)
- [MDN RTCPeerConnection.getStats](https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/getStats)
- [RFC 8656: TURN](https://www.rfc-editor.org/rfc/rfc8656)
- [LiveKit SFU documentation](https://docs.livekit.io/reference/internals/livekit-sfu)
- [mediasoup overview](https://mediasoup.org/documentation/overview/)
- [FFmpeg WHIP muxer documentation](https://ffmpeg.org/ffmpeg-formats.html)

## Goal

Make WebRTC the primary live transport while keeping the current HLS stack as a fallback and optional archival path.

Expected result:

- Viewer startup latency is sub-second to low-single-digit seconds instead of waiting for HLS segment cadence.
- Glass-to-glass latency target:
  - LAN/dev: p50 <= 500 ms, p95 <= 1.5 s.
  - Internet production: p50 <= 1.5 s, p95 <= 3 s.
- The streamer uploads one media stream to a media server, not one HTTP object per segment.
- Viewers receive media from an SFU, not from Express.
- NAT traversal is handled by ICE/STUN/TURN.
- Viewer adaptation uses WebRTC stats, RTP feedback, SFU layer selection, and sender bitrate controls instead of HLS segment download estimates and FFmpeg respawn as the normal control loop.
- The existing HLS path remains available behind feature flags for fallback, compatibility, and recording while WebRTC matures.

## Non-goals

- Do not support mobile broadcasting in this rewrite. Mobile remains viewer-only.
- Do not build a custom SFU from scratch.
- Do not use P2P mesh for live streams.
- Do not route RTP/SRTP media through Express or Nginx HTTP proxying.
- Do not remove HLS until WebRTC has production telemetry, fallback behavior, and ops coverage.

## Recommended architecture

### Media plane

Use a dedicated SFU/media server as the media plane.

Recommended first path:

1. Run a self-hosted SFU sidecar in dev/prod.
2. Use WHIP for broadcaster ingest where possible.
3. Use the SFU's native browser SDK or WHEP-shaped playback for viewers.
4. Keep Rebound's Express and Socket.IO services as the product-control plane.

Candidate media servers:

| Option | Fit | Pros | Cons |
| --- | --- | --- | --- |
| LiveKit | Recommended first candidate | Complete SFU, room model, server APIs, SDKs, distributed mode, ingress tooling | Adds a service stack and room/token model; verify passthrough vs transcode behavior for FFmpeg WHIP ingest |
| mediasoup | Strong custom-build candidate | Node-friendly, low-level SFU, signaling-agnostic, supports WebRTC and plain RTP | We own more signaling, token, room, ops, and WHEP/WHIP glue |
| Janus | Viable infra candidate | Mature server, plugins, RTP workflows | More config/plugin ceremony; less natural fit with current Node app |
| Pion custom Go service | Long-term control option | High control, strong WebRTC foundation | Too much media infrastructure to own for a rewrite MVP |

Decision gate:

- Spike LiveKit and mediasoup with the same FFmpeg test source.
- Pick the one that can ingest a local FFmpeg stream, fan out to two browser viewers, expose useful stats, and shut down cleanly with the least custom code.
- Default to LiveKit unless the spike proves it forces unwanted transcoding, packaging complexity, or UX constraints.

### Control plane

Keep Rebound's app server responsible for:

- Stream session creation and account limits.
- Viewer auth and stream discovery.
- Short-lived media-server access tokens.
- Short-lived TURN credentials.
- Viewer count, presence, chat integration, and share pages.
- Product-level telemetry and audit logs.

The current `/live-control` namespace should evolve, not disappear:

- It should stop being the main adaptation path for HLS segment delivery.
- It should continue carrying product state that the media server does not know: viewer identity, stream title, app badges, moderation state, and UI explanations.
- It should ingest WebRTC stats summaries from viewers and the streamer for Rebound dashboards.

### Data plane

Express should no longer receive live video bytes for the primary path.

Current:

```
FFmpeg -> local HLS files -> uploader -> Express PUT routes -> storage -> viewer HTTP GET -> HLS.js
```

Target:

```
FFmpeg or WebRTC publisher -> WHIP/WebRTC ingest -> SFU -> RTCPeerConnection viewer
```

HLS remains:

- Fallback when WebRTC cannot connect.
- Optional recording/archive path.
- Emergency rollback path during rollout.

## API shape

Replace the current HLS-only `createSessionResponse()` shape with a transport-aware response.

Target response:

```json
{
  "sessionId": "abc",
  "publicToken": "public",
  "status": "active",
  "transport": "webrtc",
  "control": {
    "namespace": "/live-control",
    "sessionId": "abc"
  },
  "ingest": {
    "protocol": "whip",
    "endpoint": "https://rebound.nexus/live/webrtc/whip/abc",
    "token": "short-lived-bearer",
    "iceServers": [
      { "urls": ["stun:turn.rebound.nexus:3478"] },
      { "urls": ["turn:turn.rebound.nexus:3478?transport=udp"], "username": "expiring-user", "credential": "expiring-secret" }
    ]
  },
  "playback": {
    "protocol": "webrtc",
    "mode": "livekit-sdk-or-whep",
    "endpoint": "https://rebound.nexus/live/webrtc/watch/public",
    "token": "short-lived-viewer-token",
    "hlsFallbackUrl": "https://rebound.nexus/live/watch/public/master.m3u8"
  },
  "shareUrl": "https://rebound.nexus/live/share/public"
}
```

Server endpoints to add:

- `POST /live/api/session` creates a session with `transport` defaulting to `"webrtc"` behind a feature flag.
- `POST /live/api/:sessionId/webrtc/ingest-token` refreshes streamer ingest credentials.
- `POST /live/api/share/:publicToken/webrtc/viewer-token` mints viewer credentials.
- `GET /live/api/:sessionId/ice-servers` returns short-lived ICE server config.
- `POST /live/api/:sessionId/webrtc/events` accepts server-side media events if the SFU posts webhooks.

If the selected media server supports direct WHIP/WHEP endpoints, Rebound can mint tokens and return those URLs directly. If not, Rebound owns thin WHIP/WHEP proxy endpoints that authenticate and forward SDP/session operations to the media server.

## Data model changes

Extend `server/src/models/StreamSession.js`.

New session fields:

```js
transport: "hls" | "webrtc" | "hybrid",
mediaServer: {
  provider: "livekit" | "mediasoup" | "janus" | "custom",
  roomName: String,
  nodeId: String,
  region: String,
  ingestId: String,
},
webrtc: {
  ingestProtocol: "whip" | "native-sdk" | "custom-signaling",
  playbackProtocol: "sdk" | "whep" | "custom-signaling",
  publisherConnectedAt: Date,
  publisherDisconnectedAt: Date,
  lastMediaEventAt: Date,
},
fallback: {
  hlsPlaybackPath: String,
  hlsEnabled: Boolean,
}
```

Keep existing HLS fields (`assets`, `recentSegmentNames`, `storagePrefix`) for fallback and migration. Do not overload them with WebRTC state.

## Streamer implementation

### Phase S1: transport abstraction

Split the Electron streamer manager around transport lifecycle.

Target layout:

```
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

Rules:

- Capture, filter, and encoder modules remain pure.
- Output modules own muxer-specific args only.
- Transport modules own session setup, process launch, health checks, and stop semantics.
- HLS uploader is used only by `hlsTransport`.
- WebRTC transport never writes live segments to disk.

### Phase S2: FFmpeg WHIP output

Add `public/streaming/output/whip.js`.

Responsibilities:

- Assert the bundled FFmpeg supports the `whip` muxer via `ffmpeg -hide_banner -muxers` or `ffmpeg -hide_banner -h muxer=whip`.
- Build WHIP output args from normalized stream config.
- Prefer H.264 + Opus for MVP browser compatibility.
- Attach bearer token using FFmpeg's WHIP muxer option.
- Make timeout, packet size, and DTLS/ICE options explicit in settings defaults.

Initial video/audio policy:

- Video MVP: H.264 (`h264_nvenc`, `h264_qsv`, `h264_videotoolbox`, or `libx264`) at 720p/1080p.
- Audio MVP: Opus at 48 kHz stereo.
- Later: VP9/AV1 where browser/SFU support is verified.
- Treat HEVC as an advanced/Safari-specific path, not the default WebRTC path.

Important constraint:

- An SFU cannot create per-viewer quality ladders from a single encoded layer without transcoding.
- Single-layer WHIP is acceptable for the MVP.
- Real per-viewer adaptation requires simulcast/SVC or a server transcoding ladder.

### Phase S3: simulcast/SVC strategy

Pick one after the MVP:

1. Native WebRTC publisher path:
   - Capture in Electron renderer via `desktopCapturer`/`getUserMedia`.
   - Publish through the chosen media server SDK.
   - Use `RTCRtpSender` encodings for simulcast.
   - Tradeoff: less direct FFmpeg encoder control.

2. Multi-encoder FFmpeg path:
   - Run a small ladder, for example 1080p, 720p, 360p.
   - Publish each layer as a separate ingest track/session if the SFU supports mapping them into one logical stream.
   - Tradeoff: more GPU/CPU load and more orchestration.

3. Server transcoding path:
   - Ingest one high-quality stream.
   - Media service creates lower layers.
   - Tradeoff: highest infra cost, but simplest broadcaster.

Recommendation:

- MVP with single-layer WHIP.
- Add native WebRTC/simulcast publisher only when viewer count and telemetry prove single-layer adaptation is insufficient.

## Viewer implementation

Replace `LiveStreamPlayer.jsx`'s HLS-first internals with a transport-specific player shell.

Target layout:

```
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

Viewer behavior:

- Prefer WebRTC when the session advertises it and the browser supports `RTCPeerConnection`.
- Use HLS fallback when WebRTC is disabled, unsupported, blocked, or fails ICE after a short timeout.
- Surface WebRTC connection states: `new`, `connecting`, `connected`, `disconnected`, `failed`, `closed`.
- Keep the existing share route and stream list UX; only the player transport changes.

Telemetry changes:

- Replace HLS fragment timing telemetry with `RTCPeerConnection.getStats()`.
- Report:
  - selected candidate pair type (`host`, `srflx`, `relay`);
  - RTT;
  - jitter;
  - packets lost;
  - frames decoded/dropped;
  - freezes/stalls where browser stats expose them;
  - inbound bitrate;
  - available incoming bitrate when exposed;
  - audio concealment where exposed.
- Keep viewer capability probing for codec/display information, but add WebRTC-specific capability flags.

## Adaptation model

Current HLS adaptation:

- Viewers report capability and HLS download behavior.
- Server computes one recommendation.
- Streamer respawns FFmpeg with lower settings.
- All viewers get the same lower stream.

Target WebRTC adaptation:

- SFU forwards RTP and receives RTCP feedback.
- Viewers report stats to Rebound for UI/product telemetry.
- SFU or publisher SDK handles bandwidth estimation and layer selection.
- Rebound recommends product-level ceilings, not constant respawns.

MVP:

- Preserve the current lower-only ceiling logic.
- Let Rebound reduce the publisher's max bitrate only when sustained stats show the single stream is failing for many viewers.
- Avoid FFmpeg respawn unless no runtime bitrate control is available.

After simulcast/SVC:

- Rebound sets max publisher ceiling at stream start.
- SFU selects layers per viewer.
- `/live-control` explains adaptation events to viewers.
- The streamer UI shows aggregate health, not only one current bitrate.

## Infrastructure

### Services

Add three deployment components:

1. SFU/media server
2. TURN/STUN service, likely coturn
3. Metrics/logging for media events

Dev topology:

```
Vite:       3000
Express:   6001
Socket.IO: 6002
SFU:       7880 or selected media port
TURN:      3478/5349
```

Production topology:

```
https://rebound.nexus              -> Vite/static + Express routes
wss://rebound.nexus/socket.io      -> Socket.IO
https://rtc.rebound.nexus          -> SFU HTTP/signaling APIs
udp://rtc.rebound.nexus:<range>    -> SRTP media
turns://turn.rebound.nexus:5349    -> TURN/TLS fallback
turn://turn.rebound.nexus:3478     -> TURN/UDP
```

Nginx notes:

- Keep HTTP routing for app pages, REST, and Socket.IO.
- Do not try to proxy UDP WebRTC media through the current Nginx HTTP locations.
- Use direct UDP exposure, a load balancer with UDP support, or the selected media server's recommended deployment.
- Proxy only HTTP signaling/token endpoints through Nginx.

TURN requirements:

- Use ephemeral REST-style credentials derived from a server secret.
- Credential TTL should be short, for example 10-30 minutes.
- Return ICE server config per stream/session.
- Log relay usage because TURN egress can become the main cost center.
- Alert when relay ratio climbs unexpectedly; it can indicate blocked UDP, wrong advertised IPs, or DNS/TLS issues.

## Security

- Ingest tokens are scoped to one session and one role: publisher.
- Viewer tokens are scoped to one public token/session and expire quickly.
- The ingest secret must never be sent to viewers.
- TURN credentials are short-lived and not account passwords.
- SFU webhooks must be signed.
- Media server admin APIs are private network only.
- Rate-limit token minting and WHIP/WHEP session creation.
- Enforce account single-active-stream limits before creating SFU resources.
- On session end, revoke media-server room access and disconnect publisher/viewers.

## Rollout plan

### Phase 0A: Architecture spike and ADR

Deliverables:

- Local LiveKit proof-of-concept.
- Local mediasoup proof-of-concept.
- FFmpeg test source ingest into each candidate.
- Two browser viewers watching one publisher.
- Measured startup latency, glass-to-glass latency, CPU/GPU load, and shutdown behavior.
- ADR choosing media server and ingest/playback protocol.

Exit criteria:

- A developer can run the media server locally with one command.
- The selected server can run under CI or be mocked cleanly for tests.
- The team has a clear answer for MVP codec, auth token, and NAT traversal behavior.

### Phase 0B: Server session and token layer

Deliverables:

- `StreamSession` schema extension.
- Transport-aware `createSessionResponse()`.
- Token minting for publisher and viewer.
- ICE server endpoint.
- Feature flag: `LIVE_TRANSPORT_DEFAULT=hls|webrtc|hybrid`.
- Media-server client wrapper under `server/src/live/webrtc/`.

Exit criteria:

- Existing HLS tests still pass.
- New server tests prove that viewer tokens cannot publish and publisher tokens cannot view arbitrary sessions.

### Phase 0C: Electron WHIP ingest MVP

Deliverables:

- `public/streaming/output/whip.js`.
- Capability probe for FFmpeg WHIP muxer support.
- `whipTransport` process lifecycle.
- Streamer status events for ICE/DTLS/media connection.
- HLS fallback remains selectable.

Exit criteria:

- Electron can publish a desktop or test source to the selected media server.
- Stop tears down FFmpeg and media-server publisher state.
- Failure modes produce actionable logs in the broadcaster UI.

### Phase 0D: WebRTC viewer MVP

Deliverables:

- `WebRtcPlayer` transport.
- Viewer token fetch.
- `useWebRtcPlayback()`.
- `useWebRtcStats()`.
- Fallback from WebRTC to HLS.
- E2E smoke route that verifies a WebRTC player reaches `connected`.

Exit criteria:

- Two viewers can watch one stream.
- Closing one viewer does not affect the other.
- WebRTC failure falls back to HLS without breaking the route.

### Phase 0E: Control and telemetry rewrite

Deliverables:

- Extend `shared/streaming/protocol.js` with WebRTC stats messages.
- Add server-side stats aggregation beside `viewerStore`.
- Replace HLS bandwidth assumptions in `recommender.js` with transport-aware inputs.
- Streamer UI shows publisher connection, SFU node, viewer count, relay ratio, bitrate, packet loss, and RTT summary.

Exit criteria:

- UI explains connection/adaptation states without naming implementation details.
- Existing adaptation history is preserved for HLS sessions.
- WebRTC sessions show stats without requiring HLS.js.

### Phase 0F: Fallback, recording, and cleanup

Deliverables:

- Decide whether HLS fallback is generated in parallel by the broadcaster or by SFU egress/recording.
- Keep current HLS uploader only if broadcaster-side fallback is still needed.
- Add session-level transport picker: auto, WebRTC only, HLS only.
- Document operational rollback.

Exit criteria:

- Production can disable WebRTC with one env var.
- HLS-only users can still watch.
- WebRTC sessions do not leave orphan media rooms, TURN allocations, or stale DB sessions.

### Phase 0G: Simulcast/SVC or ladder work

Deliverables:

- Decision between native WebRTC publisher, multi-encoder FFmpeg ladder, or server transcoding.
- Layer selection telemetry.
- Per-viewer quality selection.
- UI text for "lower quality on this connection" without forcing the host to downgrade everyone.

Exit criteria:

- Slow viewer no longer forces all viewers to the same lower quality when layer selection is available.
- Publisher resource cost is measured and bounded.

## Code organization target

```
server/src/live/webrtc/
  config.js
  mediaServerClient.js
  tokens.js
  iceServers.js
  sessionMapper.js
  webhooks.js

server/src/live/control/
  socket.js
  controlSession.js
  viewerStore.js
  webRtcStatsStore.js
  recommender.js

public/streaming/output/
  hls.js
  whip.js
  index.js

public/streaming/transports/
  hlsTransport.js
  whipTransport.js
  transportState.js

src/features/player/transports/
  WebRtcPlayer.jsx
  HlsPlayer.jsx
  transportPicker.js

src/features/player/hooks/
  useWebRtcPlayback.js
  useWebRtcStats.js
  useHlsPlayback.js
```

## Testing strategy

Server unit tests:

- Session creation returns transport-aware payloads.
- Tokens are role-scoped and expire.
- ICE server endpoint returns no static secrets.
- Session end tears down media-server resources.
- Existing HLS upload/playback tests remain green.

Streamer unit tests:

- WHIP argv builder emits the right muxer, token, codec, timeout, and endpoint args.
- Capability probe detects missing WHIP support and falls back cleanly.
- Transport state machine handles start, connected, failed, stopping, stopped.

Viewer unit tests:

- `transportPicker` chooses WebRTC when available and HLS fallback when not.
- `useWebRtcStats` converts `getStats()` reports into stable protocol messages.
- WebRTC connection-state overlays render correct states.

Integration tests:

- Local media server starts for tests or is replaced by a strict fake.
- FFmpeg `lavfi` test source publishes through WHIP.
- Browser viewer connects and renders nonblank video.
- Two viewers can connect concurrently.
- TURN-forced mode works in at least one staging smoke test.

Manual validation:

- Home network with normal NAT.
- Phone on cellular viewing desktop stream.
- Corporate/firewalled network where TURN/TLS is required.
- Streamer stops mid-session.
- Viewer refreshes during publisher reconnect.
- WebRTC disabled by feature flag returns to HLS behavior.

## Metrics and alerts

Collect per session:

- Publisher connected/disconnected timestamps.
- Viewer join latency.
- ICE candidate type distribution.
- TURN relay ratio.
- Publisher bitrate and packet loss.
- Viewer inbound bitrate, RTT, packet loss, jitter, dropped frames, freeze count where available.
- SFU node ID and region.
- Room teardown success/failure.

Alert on:

- Publisher connect failures above threshold.
- TURN relay ratio spike.
- Media-server CPU/network saturation.
- Orphan rooms older than session TTL.
- Viewer fallback-to-HLS rate spike.
- WebRTC p95 startup latency regression.

## Risks

- FFmpeg WHIP support depends on bundled FFmpeg version and build options. Probe it explicitly.
- Single-layer WHIP does not solve per-viewer adaptation. It only lowers transport latency.
- Simulcast from an FFmpeg-first publisher may be awkward; native WebRTC publisher may be required later.
- TURN can become expensive under restrictive networks.
- Browser codec support pushes MVP toward H.264 + Opus even though current defaults favor HEVC/NVENC.
- Media-server operations are a new responsibility: ports, advertised IPs, TLS, metrics, draining, and upgrades.
- WHEP is not fully standardized as of this plan date, so avoid hard-locking the product to WHEP-only playback.

## Relationship to existing plans

- Plans 01-03 remain useful for the HLS fallback path.
- Plan 04 remains useful for UI/state cleanup, but its streaming UI should become transport-aware.
- Plan 05 profiler work should include WebRTC stats and SFU node metrics.
- Plan 06 E2E tooling should grow a WebRTC smoke suite.

The long-term direction is not "better HLS uploads." It is "WebRTC primary, HLS fallback/recording."
