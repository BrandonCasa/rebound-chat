# Live HLS Relay Setup

This route family adds authenticated HTTPS HLS ingest under `/live/api/*`, public playback under `/live/watch/*`, and a public share page under `/live/share/:publicToken`.

The server does not transcode media. Your PC is responsible for producing compatible HLS output and pushing it upstream.

## What this adds

- `POST /live/api/session`
- `PUT /live/api/:sessionId/master.m3u8`
- `PUT /live/api/:sessionId/video.m3u8`
- `PUT /live/api/:sessionId/segments/:filename`
- `POST /live/api/:sessionId/heartbeat`
- `POST /live/api/:sessionId/end`
- `GET /live/api/share/:publicToken`
- `GET /live/watch/:publicToken/master.m3u8`
- `GET /live/watch/:publicToken/video.m3u8`
- `GET /live/watch/:publicToken/segments/:filename`
- React share page at `/live/share/:publicToken`

## Environment

Set these on the server:

```bash
LIVE_INGEST_CREATE_TOKEN=replace-with-a-long-random-string
LIVE_STORAGE_BACKEND=local
LIVE_STORAGE_DIR=./live-storage
LIVE_SESSION_TTL_MS=90000
LIVE_HEARTBEAT_INTERVAL_MS=15000
LIVE_MAX_RETAINED_SEGMENTS=18
LIVE_MAX_SEGMENT_BYTES=67108864
```

Optional S3 backend:

```bash
cd server
pnpm add @aws-sdk/client-s3

LIVE_STORAGE_BACKEND=s3
LIVE_S3_BUCKET=your-bucket
LIVE_S3_REGION=us-east-1
LIVE_S3_PREFIX=live
LIVE_S3_ENDPOINT=
LIVE_S3_FORCE_PATH_STYLE=false
```

The S3 adapter uses `@aws-sdk/client-s3` and the standard AWS credential chain.

## Reverse proxy and SSL

Use HTTPS in front of the Express server and keep the public path on port 443. In production the live router rejects non-HTTPS requests.

Proxy notes:

- disable caching for `*.m3u8`
- allow caching for immutable segment filenames
- make sure request body limits allow your segment sizes
- if your proxy buffers uploads aggressively, reduce buffering for `/live/api/*`

## Sender workflow

1. Generate rolling HLS output locally on your PC.
2. Run the uploader script against the output directory.
3. Open the returned `shareUrl` in a browser, or the `playbackUrl` directly in VLC on Apple TV.
4. Stop the uploader to send `POST /live/api/:sessionId/end` automatically.

Uploader script:

```bash
cd server
pnpm run live:upload -- --server https://your-domain.example --dir ../tmp/live-hls --token "$LIVE_INGEST_CREATE_TOKEN" --label "Deck stream"
```

The uploader watches a flat output directory and pushes changed playlists and segments. It sends heartbeats automatically and ends the session on `Ctrl+C`.

## ffmpeg example for HEVC/H.265 4K and AAC

This example keeps the output flat, uses short live segments, and creates `master.m3u8` plus `video.m3u8` for the relay:

```bash
ffmpeg -re \
  -i input.mp4 \
  -c:v libx265 \
  -preset medium \
  -pix_fmt yuv420p \
  -tag:v hvc1 \
  -x265-params "repeat-headers=1:keyint=48:min-keyint=48:scenecut=0" \
  -b:v 18M \
  -maxrate 25M \
  -bufsize 36M \
  -vf "scale=3840:2160:flags=lanczos" \
  -c:a aac \
  -b:a 192k \
  -ar 48000 \
  -ac 2 \
  -f hls \
  -hls_time 2 \
  -hls_list_size 6 \
  -hls_segment_type fmp4 \
  -hls_fmp4_init_filename init.mp4 \
  -hls_flags independent_segments+delete_segments+temp_file \
  -master_pl_name master.m3u8 \
  -hls_segment_filename "./tmp/live-hls/segment-%06d.m4s" \
  ./tmp/live-hls/video.m3u8
```

Notes:

- `temp_file` helps avoid the uploader reading partially-written playlists.
- `2` second segments with a `6` entry live list keeps delay short without making the relay overly chatty.
- If your PC cannot sustain realtime 4K HEVC, lower the resolution or use a hardware encoder. The server will still relay whatever you upload without transcoding.

## VLC on Apple TV

1. In the uploader output, copy the `playbackUrl`.
2. Open VLC on Apple TV.
3. Use the network stream option and paste the HTTPS `master.m3u8` URL.
4. Keep the sender online. When the sender ends the session, playback is revoked and the watch URL returns `410 Gone`.

## Operational behavior

- playlists are served with `Cache-Control: no-store`
- segments are served with immutable cache headers
- segment storage is trimmed to the rolling live window from the latest uploaded media playlist
- expired or ended sessions are cleaned up automatically
- ingest uses a server create token plus a per-session ingest secret
