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
 * @property {string} captureBackend             - "gfxcapture" | "gdigrab"
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
 * @property {string} hlsTime
 * @property {number} hlsListSize
 * @property {"off" | "convert" | "passthrough"} hdrMode
 *   - "off"         — SDR source; current NV12 fast path, no HDR handling.
 *   - "convert"     — HDR source, tonemap to SDR via tonemap_cuda (GPU) or
 *                     zscale/tonemap (CPU fallback). Output is SDR BT.709.
 *   - "passthrough" — HDR source, encode natively in HDR10 (P010 capture +
 *                     BT.2020/PQ colour metadata). Recommended with HEVC or AV1.
 * @property {string} [vaapiDevice]
 *   Optional VA-API render-node path used when a `*_vaapi` encoder is
 *   selected. Defaults to `/dev/dri/renderD128` (the device referenced by
 *   the FFmpeg HWAccelIntro spec). Linux only.
 */

/**
 * Capabilities describe what the host environment can do. They are derived
 * from the OS, FFmpeg build, and runtime fallback state. The fast path is
 * only chosen when capabilities permit it.
 *
 * @typedef {Object} Capabilities
 * @property {NodeJS.Platform} platform
 * @property {boolean} supportsHwmapCudaFromD3D11
 */

/**
 * @typedef {(config: StreamConfig) => string[]} ArgBuilder
 */

export {};
