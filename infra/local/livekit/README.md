# Local LiveKit Compatibility Stack

This stack is the phase 0 media compatibility baseline from `plans/00-master-plan.md`.

Start it with:

```bash
pnpm run livekit:local
```

The local server exposes:

- LiveKit HTTP/WebSocket signaling: `ws://localhost:7880`
- LiveKit API URL: `http://localhost:7880`
- API key: `devkey`
- API secret: `devsecret`

The first gate is one publisher and two browser viewers in the same room. The preferred publisher is FFmpeg WHIP if the bundled FFmpeg build reports a WHIP muxer. Run:

```bash
pnpm run probe:ffmpeg-webrtc
```

If WHIP is unavailable or fails against LiveKit, document the result in `plans/` before switching to LiveKit ingress or a native Electron WebRTC publisher.
