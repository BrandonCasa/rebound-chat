/**
 * Shared JSDoc typedefs for the sources toolkit.
 *
 * Sources are produced by Electron's built-in `desktopCapturer`. We only
 * forward the renderer-friendly subset of each `DesktopCapturerSource`:
 * the opaque id, a display name, the thumbnail (as a data URL), and any
 * available app icon. The thumbnail is included on `listSources` so the
 * picker can render immediately without waiting for the watch loop.
 *
 * @typedef {"window" | "screen"} SourceKind
 *
 * @typedef {Object} SourceInfo
 * @property {string} id              Stable, opaque identifier from desktopCapturer ("screen:0:0", "window:<hwnd>:0", ...)
 * @property {SourceKind} kind        Window vs full screen
 * @property {string} name            Human-readable display title
 * @property {string} [displayId]     For screens: the OS display identifier (`display_id` field)
 * @property {string} [thumbnail]     "data:image/png;base64,..." snapshot captured at list time
 * @property {{ width: number, height: number }} [thumbnailSize]
 * @property {string} [appIcon]       Application icon when available (windows only, opt-in)
 *
 * @typedef {Object} ThumbnailEvent
 * @property {string} sourceId        Matches a SourceInfo.id
 * @property {string} dataUrl         "data:image/png;base64,..."
 * @property {number} width
 * @property {number} height
 * @property {string} capturedAt      ISO-8601 timestamp
 *
 * @typedef {Object} EnumeratorOptions
 * @property {SourceKind[]} [types]
 *
 * @typedef {(event: ThumbnailEvent) => void} ThumbnailListener
 */

export {};
