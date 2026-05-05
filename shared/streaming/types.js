/**
 * Shared type definitions used by the renderer (viewer + streamer UI),
 * the Electron main process (streamer pipeline), and the Express server
 * (recommender). Plain ESM module so any of those runtimes can import it.
 *
 * The legacy pipeline-only types (`StreamConfig`, `Capabilities`,
 * `StreamingProfile`) live in `public/streaming/types.js` and are
 * re-exported as type aliases here. Keeping the new cross-runtime types
 * in one file avoids duplication and lets the constraint engine consume
 * a single import.
 */

/** @typedef {import("../../public/streaming/types.js").StreamConfig} StreamConfig */
/** @typedef {import("../../public/streaming/types.js").StreamingProfile} StreamingProfile */
/** @typedef {import("../../public/streaming/types.js").Capabilities} RuntimeCapabilities */

/**
 * Output of the Electron main capability probe — the catalog of what
 * this host's bundled FFmpeg + GPU + OS can do. Produced by
 * `public/streaming/capabilities/probe.js` and consumed by the renderer
 * to populate dropdowns honestly and by the auto-optimizer to pick a
 * coherent default config.
 *
 * @typedef {Object} EncoderAvailability
 * @property {boolean} h264
 * @property {boolean} hevc
 * @property {boolean} av1
 *
 * @typedef {Object} GpuInfo
 * @property {string} vendor
 * @property {string} model
 * @property {string} driver
 *
 * @typedef {Object} DetectedCapabilities
 * @property {NodeJS.Platform} os
 * @property {string} arch
 * @property {number} cpuCount
 * @property {number} totalMemory
 * @property {GpuInfo} gpu
 * @property {{ nvenc: EncoderAvailability, qsv: EncoderAvailability,
 *              amf: EncoderAvailability, videotoolbox: EncoderAvailability }} encoders
 * @property {string[]} hwaccels
 * @property {string[]} filters
 * @property {string[]} captureBackends
 * @property {Array<{ id: string, label: string, kind: "input"|"output" }>} audioDevices
 * @property {Array<{ id: number, label: string, size: { width: number, height: number },
 *                    displayFrequency: number, scaleFactor: number, primary: boolean }>} displays
 * @property {number} probedAt
 */

/**
 * Result of a single codec MIME probe on the viewer side. `smooth` and
 * `powerEfficient` are nullable because `navigator.mediaCapabilities`
 * is not universally available; when missing we still trust the Tier 1
 * `supported` boolean from `MediaSource.isTypeSupported`.
 *
 * @typedef {Object} CodecProbeResult
 * @property {boolean} supported
 * @property {boolean | null} smooth
 * @property {boolean | null} powerEfficient
 */

/**
 * @typedef {Object} ViewerNetworkProbe
 * @property {number | null} downlinkMbit              -- navigator.connection.downlink, Mbit/s
 * @property {string | null} effectiveType             -- "4g" | "3g" | "2g" | "slow-2g" | null
 * @property {number | null} rttMs
 * @property {boolean} saveData
 * @property {number | null} hlsBandwidthEstimateMbit  -- from hls.js, more reliable than navigator
 * @property {number | null} currentHlsLevel           -- index of last LEVEL_SWITCHED event
 *
 * @typedef {Object} ViewerDisplayProbe
 * @property {number} viewportWidth
 * @property {number} viewportHeight
 * @property {number} screenWidth
 * @property {number} screenHeight
 * @property {number} devicePixelRatio
 *
 * @typedef {Object} ViewerCapabilities
 * @property {string} viewerId
 * @property {Record<string, CodecProbeResult>} codecs
 * @property {string[]} supportedCodecFamilies         -- ["h264","hevc","av1","vp9"]
 * @property {ViewerNetworkProbe} network
 * @property {ViewerDisplayProbe} display
 * @property {string} userAgent
 * @property {number} probedAt
 */

/**
 * Aggregate of all currently-connected viewers for a session. Pushed to
 * the streamer by the server. The streamer renders this in the Live
 * Status panel and also feeds it back into the recommender for the
 * "fix my own audio mixer" affordance.
 *
 * @typedef {Object} ViewerSummary
 * @property {string} sessionId
 * @property {number} viewerCount
 * @property {number | null} minDownlinkMbit
 * @property {number | null} medianDownlinkMbit
 * @property {string[]} supportedCodecs                -- intersection across viewers
 * @property {{ w: number, h: number } | null} maxResolution
 * @property {number} saveDataCount
 * @property {number} updatedAt
 */

/**
 * The settings the server thinks the streamer should clamp down to.
 * Numeric fields are interpreted as the *upper bound* the server cares
 * about. The streamer's adapter always picks `min(current, recommended,
 * ceiling)` so the recommendation can never raise quality.
 *
 * @typedef {Object} RecommendedSettings
 * @property {string} sessionId
 * @property {number | null} videoBitrate              -- bps
 * @property {string | null} videoCodec
 * @property {number | null} outputWidth
 * @property {number | null} outputHeight
 * @property {number | null} fps
 * @property {string} reason
 * @property {number | null} derivedFromViewerCount
 * @property {number} updatedAt
 */

/**
 * Captures what the streamer originally chose at stream start. The
 * server-control adapter consults this on every recommendation so it
 * never lifts a setting above the user's initial choice — even if a
 * later viewer arrives whose link is much fatter than the first one.
 *
 * @typedef {Object} InitialCeiling
 * @property {number} videoBitrate
 * @property {string} videoCodec
 * @property {number | null} outputWidth
 * @property {number | null} outputHeight
 * @property {number | null} fps
 * @property {number} createdAt
 */

/**
 * Streamer's reply to a `recommended-settings` push. Distinguishes
 * "applied with these final values" from "ignored because auto-adapt
 * was off / clamped to the ceiling / FFmpeg respawn failed".
 *
 * @typedef {Object} RecommendationAck
 * @property {string} sessionId
 * @property {boolean} applied
 * @property {Partial<StreamConfig> | null} actualSettings
 * @property {"user-initial-ceiling" | "user-disabled" | "respawn-failed" | "no-change" | null} clampedBy
 * @property {string} reason
 * @property {string | null} ackId
 */

/**
 * Result of a single constraint check in the renderer's constraint
 * engine. Severity maps to UI behaviour: `error` disables the field,
 * `warning` paints it amber + offers a "fix automatically" link,
 * `info` is a soft tooltip.
 *
 * @typedef {Object} ConstraintResult
 * @property {string} field
 * @property {"error" | "warning" | "info"} severity
 * @property {string} message
 * @property {Partial<StreamConfig> | null} fixPatch    -- what to merge to satisfy the constraint
 */

/**
 * Audio source descriptor consumed by `public/streaming/audio/filterGraph.js`.
 * Per-source flags (gain, muted, enabled) drive the per-input volume
 * filter in the eventual amix graph. Phase E populates this; we reserve
 * the type now so the renderer's audio mixer + constraint engine can
 * already speak the shape.
 *
 * @typedef {Object} AudioSource
 * @property {string} id
 * @property {"microphone" | "desktop" | "process_include" | "process_exclude" | "file"} kind
 * @property {string} label
 * @property {string} [targetProcessName]
 * @property {number} [targetPid]
 * @property {number} gain
 * @property {boolean} muted
 * @property {boolean} enabled
 */

export {};
