# TODO: Add HTTPS HLS Relay Route for VLC on Apple TV

## Goal

Add a new `/live` route family to Rebound that lets a trusted PC push a rolling live HLS stream to the site over HTTPS, and lets a remote viewer open the resulting `.m3u8` URL directly in VLC on Apple TV.

This should fit the current app shape:

- frontend uses React Router in `src/App.jsx`
- frontend pages are isolated route modules under `src/routes/*`
- pages use the existing MUI `Box` / `Stack` / `Paper` / `Card` style already used by the landing page and utility screens
- backend is a separate Express app under `server/src`
- existing API traffic is mounted under `/api`, so the live feature should stay in its own `/live/*` namespace and avoid changing existing `/api` behavior

## Current-design fit

### Frontend

- Add a lazy-loaded route entry in `src/App.jsx` for the share screen
- Keep the viewer UI as a simple public page under the same app shell, using the existing Rebound layout language:
  - `LandingHeader`-style page title/subtitle
  - a small set of MUI cards or papers for playback URL, session state, revoke notes, and QR handoff
  - no browser video player in first pass

### Backend

- Keep all ingest and playback concerns isolated in a new backend module tree under `server/src`
- Follow the existing pattern of:
  - route module in `server/src/routes`
  - models in `server/src/models`
  - shared helpers in `server/src/utils`
  - logger integration through `server/src/logger.js`

## Requirements

- New route namespace, isolated from existing app behavior
- HTTPS / SSL only, standard port 443 compatibility
- VLC on Apple TV must be able to open the playback URL directly
- Server should relay and serve HLS assets, not transcode video
- PC sender is the ingest source
- Playback target is 4K-capable HEVC/H.265 with AAC audio when available
- Keep setup simple for the viewer
- Short live delay preferred
- Session/share links should be revocable

## Architecture

- PC generates rolling HLS output locally
- PC uploads playlists and segments to website ingest endpoints
- Website stores current playlist state and recent segments
- Website serves public playback URL over HTTPS
- Viewer opens `master.m3u8` in VLC on Apple TV

## Route plan

### Public/backend route namespace

These should live directly under `/live/*` on the Express server so playback URLs stay clean and do not disturb the current `/api/*` contract:

- `POST /live/api/session`
- `PUT /live/api/:sessionId/master.m3u8`
- `PUT /live/api/:sessionId/video.m3u8`
- `PUT /live/api/:sessionId/segments/:filename`
- `POST /live/api/:sessionId/heartbeat`
- `POST /live/api/:sessionId/end`
- `GET /live/watch/:publicToken/master.m3u8`
- `GET /live/watch/:publicToken/video.m3u8`
- `GET /live/watch/:publicToken/segments/:filename`
- `GET /live/share/:publicToken`

### Repo-level implementation target

- backend route entry: new `server/src/routes/live.js`
- mount point: extend `server/src/routes/index.js` so `/live` is handled outside the existing `/api` router
- frontend share page: new `src/routes/LiveSharePage/LiveSharePage.route.jsx`
- frontend router registration: extend `src/App.jsx`

## Backend tasks

- Add stream session model
- Add ingest authentication with separate ingest secret
- Add public playback token model
- Add upload endpoints for playlists and segments
- Add heartbeat / expiry handling
- Add cleanup job for old segments and dead sessions
- Add storage abstraction for local disk or S3
- Add playback endpoints with correct content types
- Add cache headers:
  - playlists: `no-store`
  - segments: cacheable if filename is immutable

- Add rate limiting on ingest and playback routes
- Add structured logging for session lifecycle and playback access

## Storage tasks

- Decide storage backend:
  - local persistent disk, or
  - S3/object storage

- Store only active playlists and recent rolling segment window
- Enforce max storage per session
- Remove expired sessions automatically

## Reverse proxy / deployment tasks

- Ensure SSL route works on existing domain
- Ensure large enough upload body limits for segment files
- Disable problematic proxy buffering for live playlist updates if needed
- Confirm CDN/proxy does not cache playlists incorrectly
- Confirm segment MIME types are correct

## API/data tasks

### Define `StreamSession` type

Track:

- session id
- public token
- ingest secret hash
- created at
- updated at
- last heartbeat
- playback path
- status

### Define `StreamAsset` metadata type

Track:

- asset filename
- asset kind (`master`, `media-playlist`, `segment`)
- content type
- byte size
- created at
- last served at

### Session states

- `active`
- `ended`
- `expired`

## Viewer/share tasks

- Create simple share page that matches the current Rebound page language instead of a standalone microsite
- Show the direct playback URL prominently for copy/paste into VLC on Apple TV
- Optionally render QR code for easy phone handoff
- Allow revoke / end session from admin or authenticated sender side
- Keep the share page readable inside the existing `CustomAppBar`/main-content layout

## Sender-side tasks

- Create small local uploader script or helper app
- Script should:
  - create session
  - run or coordinate with ffmpeg
  - upload changed playlists and segments
  - send heartbeat
  - end session cleanly

- Prefer short HLS segments for lower delay
- Prefer fMP4 HLS if practical

## Validation tasks

- Test on desktop VLC first
- Test remote network playback over HTTPS
- Test Apple TV VLC playback with direct `.m3u8` URL
- Test pause behavior by pausing local sender and measuring stall delay remotely
- Test 4K HEVC playback stability
- Test restrictive Wi-Fi / hotspot scenario

## Non-goals

- No custom Apple TV app
- No server-side transcoding in first pass
- No WebRTC in first pass
- No browser player required
- No end-to-end encryption required

## Deliverables

- Backend route implementation
- Storage implementation
- Sender helper script
- Setup README
- Example ffmpeg command
- Test notes for Apple TV VLC playback

## First implementation pass in this repo

1. Add backend `/live` router and wire it in without touching existing `/api` handlers.
2. Add `StreamSession` persistence and a local-disk storage adapter first.
3. Implement ingest upload endpoints plus public watch endpoints with correct MIME/cache behavior.
4. Add cleanup/expiry and revocation.
5. Add a simple MUI-based `/live/share/:publicToken` page in the React app.
6. Add sender uploader script and README with an ffmpeg example.
7. Test local desktop VLC, then remote HTTPS playback, then Apple TV VLC.
