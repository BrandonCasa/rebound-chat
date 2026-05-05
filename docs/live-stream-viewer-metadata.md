# Live Stream Viewer Metadata

What information about a live stream is (or could be made) available to viewers
via the public share API. The viewer payload is the `LiveShareSummary` returned
by `GET /live/api/share/:publicToken` (and the list endpoint), produced by
`server/src/live/service.js → createDetailedShareSummary`.

The current viewer-side renderer is `src/components/Live/LiveStreamInfoTooltip.jsx`.
This document is the menu of fields a future UI can pull from — UI changes are
out of scope for now.

---

## 1. Already exposed (no plumbing needed)

These fields are already populated and shipped to viewers in
`shareSummary.mediaInfo` and on the summary itself.

### Session-level

| Field                              | Source                                  | Notes |
| ---------------------------------- | --------------------------------------- | ----- |
| `sessionId`                        | `StreamSession.sessionId`               |       |
| `label`                            | `StreamSession.label`                   | Free-form caster-supplied label. |
| `createdByUser` / `createdByUsername` | `StreamSession`                       | Account that owns the broadcast. |
| `status`                           | `StreamSession.status`                  | `active` \| `ended` \| `expired`. |
| `createdAt`                        | `StreamSession.createdAt`               |       |
| `lastHeartbeatAt`                  | `StreamSession.lastHeartbeatAt`         | Liveness signal (caster pings every ~15s). |
| `expiresAt`                        | `StreamSession.expiresAt`               | Server-side cleanup deadline. |
| `endedAt`                          | `StreamSession.endedAt`                 | Set on graceful stop. |
| `playbackUrl` / `shareUrl`         | derived                                 |       |
| `recentSegmentCount`               | `StreamSession.recentSegmentNames`      |       |
| `hasMasterPlaylist` / `hasMediaPlaylist` / `isPlayable` | derived             | UI gating. |

### From the master playlist (`master.m3u8`)

Parsed by `parseMasterPlaylistInfo` from the first `#EXT-X-STREAM-INF` line.

| Field              | HLS attribute        | Notes |
| ------------------ | -------------------- | ----- |
| `bandwidth`        | `BANDWIDTH`          | Peak bps. |
| `averageBandwidth` | `AVERAGE-BANDWIDTH`  | Optional — FFmpeg doesn't always emit. |
| `codecs`           | `CODECS`             | e.g. `avc1.640028,mp4a.40.2`. |
| `resolution`       | `RESOLUTION`         | e.g. `1920x1080`. |
| `frameRate`        | `FRAME-RATE`         | Now populated by both FFmpeg (because of `-r <fps>`) and our fallback master writer. |
| `videoRange`       | `VIDEO-RANGE`        | `SDR` / `HDR` / `PQ`. Already parsed; **not currently rendered in the tooltip**. |

### From the media playlist (`video.m3u8`)

Parsed by `parseMediaPlaylistInfo`.

| Field                  | Source                       | Notes |
| ---------------------- | ---------------------------- | ----- |
| `targetDuration`       | `#EXT-X-TARGETDURATION`      |       |
| `mediaSequence`        | `#EXT-X-MEDIA-SEQUENCE`      |       |
| `segmentCount`         | derived                      | Sliding-window length. |
| `totalDuration`        | sum of `#EXTINF`             | Effective playlist window. |
| `firstSegmentUri`      | derived                      | Already parsed; **not rendered**. |
| `latestSegmentUri`     | derived                      |       |
| `mapUri`               | `#EXT-X-MAP:URI`             | Init segment (`init.mp4`). Already parsed; **not rendered**. |
| `hasEndList`           | `#EXT-X-ENDLIST`             | Already parsed; **not rendered**. Useful to distinguish live vs ended VOD. |
| `independentSegments`  | `#EXT-X-INDEPENDENT-SEGMENTS`| Already parsed; **not rendered**. |

### Storage / asset stats

| Field                  | Source                 |
| ---------------------- | ---------------------- |
| `storageBackend`       | `local` \| `s3`        |
| `maxRetainedSegments`  | per-session cap        |
| `retainedSegmentNames` | sliding window         |
| `retainedSegmentCount` |                        |
| `assetCount`           | playlists + segments   |
| `totalRetainedBytes`   | sum of asset sizes     |
| `latestSegment`        | `{ filename, byteSize, contentType, createdAt, updatedAt, lastServedAt }` |
| `playlists.master`     | asset metadata for `master.m3u8` |
| `playlists.media`      | asset metadata for `video.m3u8`  |

---

## 2. Cheap to expose (parse more from existing playlists)

No ingest-side changes — just extend `parseMasterPlaylistInfo` /
`parseMediaPlaylistInfo` in `server/src/live/service.js`.

| Field                       | HLS source                                       | Why it's useful |
| --------------------------- | ------------------------------------------------ | --------------- |
| `hlsVersion`                | `#EXT-X-VERSION`                                 | Compatibility hint. |
| `playlistType`              | `#EXT-X-PLAYLIST-TYPE`                           | `EVENT` / `VOD` if ever set. |
| `programDateTime`           | `#EXT-X-PROGRAM-DATE-TIME` on latest segment     | Wall-clock anchor for sync to chat. |
| `discontinuitySequence`     | `#EXT-X-DISCONTINUITY-SEQUENCE`                  | Track encoder restarts. |
| `discontinuityCount`        | count of `#EXT-X-DISCONTINUITY`                  |                 |
| `partTargetDuration`        | `#EXT-X-PART-INF:PART-TARGET`                    | Low-latency HLS. |
| `serverControl`             | `#EXT-X-SERVER-CONTROL`                          | LL-HLS hold-back values. |
| `independentSegments`       | already parsed — just plumb through              |                 |
| `mapUri` / `initSegmentBytes` | already parsed                                 | Surfaces init segment size + URL. |
| `latestSegmentDuration`     | last `#EXTINF` value                             | Per-segment cadence vs target. |
| `firstSegmentProgramDateTime` | first `#EXT-X-PROGRAM-DATE-TIME`               | Stream "epoch" for offset math. |
| `audioOnlyTrack`            | `#EXT-X-MEDIA:TYPE=AUDIO` lines                  | When we add separate audio renditions. |
| `subtitlesTracks`           | `#EXT-X-MEDIA:TYPE=SUBTITLES`                    | Future caption support. |
| `iframeStreamInfo`          | `#EXT-X-I-FRAME-STREAM-INF`                      | Trick play. |

Per-variant (when we add multi-bitrate ladders): split `parseMasterPlaylistInfo`
to return an array of variants, each with its own `BANDWIDTH`,
`AVERAGE-BANDWIDTH`, `RESOLUTION`, `FRAME-RATE`, `CODECS`, `VIDEO-RANGE`,
`HDCP-LEVEL`, `SCORE`.

---

## 3. Computable on the server (no caster cooperation)

Derivations from data the server already has. All cheap to add to
`createShareSummary` / `createMediaInfo`.

| Field                   | Computation                                                 |
| ----------------------- | ----------------------------------------------------------- |
| `uptimeMs`              | `now - createdAt` (only when `status === "active"`).        |
| `endedDurationMs`       | `endedAt - createdAt`.                                      |
| `secondsSinceHeartbeat` | `now - lastHeartbeatAt`. Quick health indicator.            |
| `isStale`               | `secondsSinceHeartbeat > 2 * heartbeatIntervalMs`.          |
| `glassToGlassEstimateMs`| `(playlistWindowSeconds + targetDuration) * 1000`. HLS minimum latency floor. |
| `averageSegmentDuration`| `totalDuration / segmentCount`.                             |
| `averageSegmentBytes`   | `totalRetainedBytes / retainedSegmentCount`.                |
| `effectiveBitrateBps`   | `averageSegmentBytes * 8 / averageSegmentDuration`. Real measured throughput vs advertised `BANDWIDTH`. |
| `segmentsPerMinute`     | rolling rate from `recentSegmentNames` timestamps.          |
| `lastSegmentAgeMs`      | `now - latestSegment.updatedAt`. Detect ingest stalls.      |
| `viewerCount`           | requires a viewer-tracking subsystem (not present yet).     |

---

## 4. Ingest-side details (need plumbing from desktop → server)

These live in the Electron `StreamConfig` and never reach the server today.
To expose them, add fields to `POST /live/api/session` and persist them on the
`StreamSession` document, then echo them back through `createShareSummary`.

| Field                | StreamConfig key                                        | Notes |
| -------------------- | ------------------------------------------------------- | ----- |
| `videoCodecLabel`    | `videoCodec` (`h264_nvenc`, `hevc_nvenc`, `libx264`, …) | Friendlier than the `CODECS` 4CC. |
| `audioCodecLabel`    | `audioCodec` (`aac`, `opus`, …)                         | |
| `audioBitrate`       | `audioBitrate`                                          | Currently only video bitrate is implied via `BANDWIDTH`. |
| `audioSampleRate`    | derived (we always force `48000` for AAC)               | |
| `audioChannels`      | derived (we always force `2` for AAC)                   | |
| `targetVideoBitrate` | `videoBitrate`                                          | Vs measured `effectiveBitrateBps`. |
| `gopSize`            | `gopSize`                                               | Affects seek granularity. |
| `captureFps`         | `captureFps`                                            | Compare against output `frameRate` to detect frame-rate conversion. |
| `outputFps`          | `fps`                                                   | Already in master `FRAME-RATE` but explicit is nicer. |
| `hdrMode`            | `hdrMode` (`off` \| `convert` \| `passthrough`)         | Pairs with master `VIDEO-RANGE`. |
| `encoderPreset`      | `encoderPreset` (`p6`, `veryfast`, `realtime`, …)       | Quality/perf knob. |
| `encoderTune`        | `nvencTune`                                             | NVENC only. |
| `rateControl`        | `nvencRc` (`vbr`, `cbr`, `constqp`)                     | |
| `captureBackend`     | `captureBackend` (`gfxcapture`, `gdigrab`, `avfoundation`, `x11grab`) | |
| `captureSourceName`  | `source.name`                                           | "Display 1", window title, etc. — **privacy: opt-in**. |
| `hlsSegmentSeconds`  | `hlsTime`                                               | Determines minimum latency. |
| `hlsListSize`        | `hlsListSize`                                           | Playlist sliding-window length. |
| `rtbufsize`          | `rtbufsize`                                             | Diagnostic. |
| `casterPlatform`     | `process.platform` + `arch` from `getCapabilities()`    | `win32-x64`, `darwin-arm64`, … |
| `casterFfmpegVersion`| probe `ffmpeg -version` once at startup                 | Helps debug player issues. |
| `casterAppVersion`   | `app.getVersion()` from Electron                        | |

Suggested transport: extend the create-session payload (already POSTs `label` and `retainSegmentCount`) with a `clientInfo` object, and persist it as `session.clientInfo`. Heartbeats can carry mutable values (e.g. encoder preset changes mid-stream) but it's fine to make them immutable for now.

---

## 5. Engagement / chat overlap (future)

Not derivable from streaming pipeline — needs new subsystems, listed for completeness.

- Concurrent viewer count + peak.
- Chat message rate during the broadcast.
- Geographic distribution (CDN logs / GeoIP).
- Per-viewer playback quality (rebuffering ratio, dropped frames) via Player Beacon.
- Recording availability / VOD URL once segments are stitched.

---

## Quick wins (recommended order)

1. **Render the parsed-but-hidden fields**: `videoRange`, `hasEndList`, `independentSegments`, `mapUri`. Zero server changes.
2. **Server-side derivations**: `uptimeMs`, `secondsSinceHeartbeat`, `lastSegmentAgeMs`, `glassToGlassEstimateMs`, `effectiveBitrateBps`. ~30 lines in `createMediaInfo`.
3. **`programDateTime` extraction**: enables wall-clock chat sync. ~5 lines in `parseMediaPlaylistInfo`.
4. **`clientInfo` plumbing**: ship `outputFps`, `captureFps`, `encoderPreset`, `hdrMode`, `casterPlatform`, `casterAppVersion`. Adds ~1 schema field + 1 payload field.
