/**
 * Public entry point for the desktop sources toolkit.
 *
 * Re-exports the `SourceService` façade (and its IPC bridge), plus the
 * thumbnail cache for any caller that wants to query it directly.
 */

export { SourceService } from "./service.js";
export { ThumbnailCache } from "./cache.js";
export { registerSourceServiceIpc, CHANNELS as SOURCE_IPC_CHANNELS } from "./ipc.js";
