/**
 * Shared helper for computing the FFmpeg `-bufsize` value (the VBV
 * buffer width).
 *
 * VBV is the Video Buffering Verifier model: a notional decoder buffer
 * that the encoder is allowed to fill and drain within a fixed window.
 * `bufsize` is the size of that window in bits. A larger window lets
 * the encoder skew bit allocation across more time (better quality on
 * complex frames at the cost of variable instantaneous bitrate); a
 * tighter window forces convergence faster (more predictable
 * per-segment file sizes and lower peak bitrate).
 *
 * For live HLS, where each `hls_time` segment is sealed and uploaded
 * as a discrete file, a 1-second window (`multiplier = 1.0`) is the
 * standard practice. Wider windows let one segment burst to ~2× the
 * configured bitrate, which both saturates contended uplinks and
 * makes per-segment upload duration unpredictable.
 *
 * NVENC, QSV, libx264/libx265 and AMF/VideoToolbox all honour the
 * `-bufsize` flag for their respective rate-control modes. VAAPI's
 * driver-managed rate control treats it as advisory, but accepts it.
 *
 * @typedef {import("../types.js").StreamConfig} StreamConfig
 */

import { parseBitrateToBps } from "../codecs.js";

/**
 * Compute the VBV buffer size in bits (the value FFmpeg expects after
 * `-bufsize`).
 *
 * @param {string} bitrate           Configured target bitrate, e.g. "8M".
 * @param {number} [multiplier=1.0]  VBV window expressed as a multiple of
 *                                   the per-second bitrate. 1.0 = 1-second
 *                                   window (standard for live HLS).
 * @returns {number}                 Buffer size in bits per second.
 */
const computeVbvBufsize = (bitrate, multiplier = 1.0) => Math.round(parseBitrateToBps(bitrate) * multiplier);

export { computeVbvBufsize };
