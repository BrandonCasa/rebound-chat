/**
 * Shared JSDoc typedefs for the sources toolkit.
 *
 * The toolkit replaces Electron's `desktopCapturer` with an FFmpeg-based
 * pipeline that works identically on every platform we support:
 *   - Windows : Windows.Graphics.Capture via FFmpeg's `gfxcapture`
 *   - macOS   : AVFoundation
 *   - Linux   : x11grab (with optional KMS/VAAPI variants in the future)
 *
 * Every public surface in `public/sources/` is described in terms of the
 * structures below. Producers (enumerators, thumbnailers) and consumers
 * (the IPC bridge, the renderer) reference the same shapes so changes
 * here surface as type errors throughout the toolkit.
 *
 * @typedef {"window" | "screen"} SourceKind
 *
 * @typedef {Object} SourceInfo
 * @property {string} id              Stable, opaque identifier ("screen:0", "window:<hash>:<title>")
 * @property {SourceKind} kind        Window vs full screen
 * @property {string} name            Human-readable display title
 * @property {string} [appName]       Owning application name when known
 * @property {number} [pid]           Owning process id when known
 * @property {string} [displayId]     For screens: the OS display identifier
 * @property {{ width: number, height: number }} [bounds]
 *
 * @typedef {Object} ThumbnailEvent
 * @property {string} sourceId        Matches a SourceInfo.id
 * @property {string} dataUrl         "data:image/png;base64,..."
 * @property {number} width
 * @property {number} height
 * @property {string} capturedAt      ISO-8601 timestamp
 *
 * @typedef {Object} ThumbnailRequest
 * @property {string} sourceId
 * @property {SourceInfo} source
 * @property {number} intervalMs      How often to refresh in continuous mode
 * @property {number} [scale]         Output scale factor (0-1) applied to the source's native size; defaults to 0.5.
 *
 * @typedef {Object} EnumeratorOptions
 * @property {SourceKind[]} [types]
 *
 * @typedef {Object} ThumbnailerHostInfo
 * @property {string} ffmpegPath
 * @property {string} cacheDir         Disk dir for atomic PNG output
 * @property {NodeJS.Platform} platform
 * @property {string} arch
 *
 * @typedef {(event: ThumbnailEvent) => void} ThumbnailListener
 */

export {};
