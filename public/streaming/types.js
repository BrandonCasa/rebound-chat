/**
 * Shared type definitions for the streaming pipeline modules.
 *
 * These modules are intentionally pure: they take a normalized {@link StreamConfig}
 * and return argv pieces (arrays of strings) or filter strings. Composition
 * happens in `pipeline.js`. No module under `streaming/` mutates state, logs,
 * or performs I/O.
 */

/**
 * @typedef {Object} StreamSource
 * @property {string} id
 * @property {string} [name]
 */

/**
 * Normalized config produced by ElectronLiveStreamManager.normalizeConfig.
 *
 * @typedef {Object} StreamConfig
 * @property {string} ffmpegPath
 * @property {StreamSource | null} source
 * @property {"screen"|"window"|"file"} [sourceMode]
 * @property {string=} filePath
 * @property {boolean=} fileLoop
 * @property {string} captureBackend             - "gfxcapture" | "gdigrab" | "file"
 * @property {number} captureFps
 * @property {string} rtbufsize
 *   Real-time input buffer size passed to live capture inputs (gdigrab,
 *   avfoundation, x11grab, dshow audio). Empty string disables the flag.
 *   Accepts FFmpeg size syntax (e.g. "256M", "512M"). Helps avoid
 *   "real-time buffer 100% full, frame dropped!" warnings.
 * @property {string[]} manualInputArgs
 * @property {string[]} audioInputArgs
 * @property {boolean} mapSourceAudio
 * @property {boolean} drawMouse
 * @property {string} videoCodec
 * @property {string} audioCodec
 * @property {number | null} outputWidth
 * @property {number | null} outputHeight
 * @property {string} videoBitrate
 * @property {string} audioBitrate
 * @property {number | null} fps
 * @property {string} encoderPreset
 * @property {string} nvencTune
 * @property {string} nvencMultipass
 * @property {string} nvencRc
 * @property {number | null} nvencCq
 * @property {boolean} nvencSpatialAq
 * @property {boolean} nvencTemporalAq
 * @property {string} nvencBRefMode
 * @property {number | null} nvencBFrames
 * @property {number | null} nvencLookahead
 * @property {number} gopSize
 * @property {number} vbvMultiplier
 *   VBV buffer width expressed as a multiple of the per-second video
 *   bitrate. The encoder is allowed to skew bit allocation across this
 *   window before its average has to converge to `videoBitrate`.
 *
 *   1.0 (default) = 1-second window — standard for live segmented
 *   streaming, gives predictable per-segment file sizes and a tighter
 *   peak instantaneous bitrate. 0.5 narrows the window further (CBR-
 *   like behaviour, best for capped uplinks); 2.0 restores the legacy
 *   2-second window used for VOD.
 * @property {string} hlsTime
 * @property {number} hlsListSize
 * @property {"off" | "convert" | "passthrough"} hdrMode
 *   - "off"         — SDR source. `gfxcapture` emits an 8-bit BGRA D3D11
 *                     hwframe; NVENC consumes it directly.
 *   - "convert"     — HDR source, tonemap to SDR via CPU `zscale`/`tonemap`.
 *                     Requires `hwdownload` because there is no on-GPU
 *                     tonemap path on stock FFmpeg + gfxcapture (the CUDA
 *                     fast path advertised in earlier comments was
 *                     fictional). Output is SDR BT.709.
 *   - "passthrough" — HDR source, encode natively in HDR10. `gfxcapture`
 *                     captures at X2BGR10 (10-bit) and the D3D11 hwframe
 *                     is fed straight into NVENC. NVENC auto-selects the
 *                     MAIN10 profile for 10-bit input. Recommended with
 *                     HEVC or AV1; H.264 lacks standardised HDR10
 *                     signalling.
 * @property {string} [vaapiDevice]
 *   Optional VA-API render-node path used when a `*_vaapi` encoder is
 *   selected. Defaults to `/dev/dri/renderD128` (the device referenced by
 *   the FFmpeg HWAccelIntro spec). Linux only.
 */

/**
 * Capabilities describe what the host environment can do. They are
 * derived from the OS and the FFmpeg build. Today the only knob that
 * affects the pipeline is `platform`; the field is kept as an object so
 * future host-specific switches can be threaded through without
 * touching every signature.
 *
 * @typedef {Object} Capabilities
 * @property {NodeJS.Platform} platform
 */

/**
 * @typedef {(config: StreamConfig) => string[]} ArgBuilder
 */

/**
 * Curated set of encoder parameters that describe a coherent streaming
 * trade-off (latency vs. quality vs. bandwidth stability). Selecting a
 * profile in the renderer overwrites the dependent fields on the active
 * `StreamConfig`. A profile is intentionally a `Partial<StreamConfig>`:
 * it touches only the fields it has an opinion on and leaves everything
 * else (resolution, codec selection, capture backend, audio, HLS
 * timing) under the user's direct control.
 *
 * Profiles are file-per-profile in `public/streaming/profiles/`. To add
 * a new profile, drop a file there and register it in `index.js`.
 *
 * @typedef {Object} StreamingProfile
 * @property {string} id
 *   Stable machine identifier — "low-latency" | "balanced" | "quality" |
 *   "stable-uplink". Used by `detectProfile` (Plan 04) and persisted in
 *   the settings store.
 * @property {string} label
 *   Display name shown in the settings UI.
 * @property {string} description
 *   One-sentence explanation of the trade-off this profile makes.
 * @property {string} latencyHint
 *   Human-readable glass-to-glass estimate, e.g. "~500 ms".
 * @property {Partial<StreamConfig>} values
 *   Subset of `StreamConfig` fields this profile sets. Applied via
 *   `applyProfile(profile, settings)` as a shallow merge:
 *   `{ ...settings, ...profile.values }`.
 */

export {};
