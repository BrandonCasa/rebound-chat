/**
 * Public entry point for the cross-platform sources toolkit.
 *
 * Re-exports the high-level API while keeping the internal modules
 * importable for tests and for any future consumer that needs lower-level
 * primitives.
 */

export { SourceService } from "./service.js";
export { ThumbnailManager } from "./thumbnailer/index.js";
export { ThumbnailCache } from "./cache.js";
export { selectEnumerator } from "./enumerator/index.js";
export { selectThumbnailBuilder } from "./thumbnailer/builders/index.js";
export { registerSourceServiceIpc, CHANNELS as SOURCE_IPC_CHANNELS } from "./ipc.js";
