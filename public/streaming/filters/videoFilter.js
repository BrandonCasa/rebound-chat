/**
 * Single source of truth for "which video filter chain do we use?".
 *
 * Returns a string suitable for `-vf` (when a single input is involved)
 * or for the body of `-filter_complex` (the caller appends `[v]`).
 *
 * Returns `null` when no filter is needed at all (the encoder will read
 * the raw input directly).
 *
 * Architecture (see `HWAccelIntro` § CUDA: "NVENC can accept d3d11
 * frames context directly", and the gfxcapture filter doc):
 *
 *   gfxcapture is a D3D11 hardware-frame source. Its `output_fmt`
 *   AVOption only accepts BGRA / X2BGR10 / RGBAF16 — there is no
 *   NV12 / P010 path. NVENC accepts a D3D11 hwframe directly via
 *   `NV_ENC_INPUT_RESOURCE_TYPE_DIRECTX` for any of those underlying
 *   formats, and auto-selects the MAIN10 HEVC profile when the input
 *   is 10-bit.
 *
 *   That means three of the four gfxcapture chains stay GPU-resident
 *   end-to-end with no `hwmap` / no CUDA derivation / no `-init_hw_device`.
 *
 *   The fourth (HDR→SDR tonemap) has to round-trip through system
 *   memory: stock FFmpeg + gfxcapture has no on-GPU tonemap path
 *   (`tonemap_cuda` requires CUDA hwframes, which we cannot produce
 *   from a D3D11 frame — `cuda_device_derive` only accepts Vulkan
 *   sources, returning ENOSYS for everything else).
 *
 * @typedef {import("../types.js").StreamConfig} StreamConfig
 * @typedef {import("../types.js").Capabilities} Capabilities
 */

import { isNvencCodec, isVaapiCodec } from "../codecs.js";
import { gfxcapture, usesGfxCapture } from "../capture/index.js";

/**
 * Whether to insert an `fps` step.
 *
 * Inserted whenever `config.fps` is set, even when it equals
 * `config.captureFps`. The filter strictly drops any frames that arrive
 * faster than the configured target rate, providing a hard cap in
 * front of the encoder. Without it, a real-time capture source that
 * occasionally bursts above its declared `max_framerate` (gfxcapture
 * is not strict about this in practice) can push NVENC — especially
 * on low-latency presets like `p1` / `fast_live` — to encode faster
 * than the configured `fps`, producing video whose timeline outpaces
 * wall-clock playback.
 *
 * `effectiveCaptureFps()` already caps the source at fps + 15 %, so
 * the filter at most drops the residual 15 % overshoot — never
 * duplicates frames against an underrun.
 *
 * @param {StreamConfig} config
 * @returns {boolean}
 */
const needsFps = (config) => Boolean(config.fps);

/**
 * Build the gfxcapture filter chain.
 *
 * SDR (`hdrMode === "off"`):
 *   gfxcapture(bgra, sized) → fps → encoder
 *   - NVENC: accepts BGRA D3D11 frames directly; no hwdownload, no
 *     CPU pixel-format pass.
 *   - Software / AMF / QSV without an explicit hwctx: needs system
 *     memory in YUV space, so insert `hwdownload,format=yuv420p`.
 *
 * HDR passthrough (`hdrMode === "passthrough"`):
 *   gfxcapture(x2bgr10, sized) → fps → nvenc
 *   - NVENC accepts 10-bit X2BGR10 D3D11 frames directly and
 *     auto-selects the MAIN10 HEVC profile (see
 *     `nvenc_hevc.c`'s `IS_10BIT(...)` check).
 *   - For non-NVENC encoders, passthrough is treated like the
 *     `convert` path (HDR is downloaded and tonemapped) because no
 *     other Windows-side encoder we ship handles 10-bit RGB
 *     transparently. This keeps the pipeline correct rather than
 *     silently dropping bits.
 *
 * HDR convert (`hdrMode === "convert"`):
 *   gfxcapture(bgra, sized) → hwdownload → format=bgra
 *     → zscale linearise → gbrpf32le → bt709 → tonemap=hable → bt709 yuv420p
 *     → fps → encoder
 *   - Stays on BGRA because zscale's `tonemap` operates in RGB space.
 *   - The on-GPU alternative would be `d3d11va → vulkan → cuda →
 *     tonemap_cuda`, which adds a Vulkan device dependency we do not
 *     ship. Deferred.
 *   - gfxcapture's BGRA→NV12 path applies an OS-level HDR→SDR mapping
 *     before we even see the frame when fed an HDR display, so
 *     starting from BGRA is acceptable for typical desktop sources.
 *
 * @param {StreamConfig} config
 * @returns {string}
 */
const buildGfxCaptureChain = (config) => {
	const filters = [];
	const hdrMode = config.hdrMode || "off";
	const isNvenc = isNvencCodec(config.videoCodec);

	const useX2bgr10Direct = hdrMode === "passthrough" && isNvenc;
	const wantsCpuTonemap = hdrMode === "convert" || (hdrMode === "passthrough" && !isNvenc);

	const captureFmt = useX2bgr10Direct ? "x2bgr10" : "bgra";
	filters.push(gfxcapture.buildSourceFilter(config, { outputFmt: captureFmt }));

	if (wantsCpuTonemap) {
		filters.push("hwdownload");
		filters.push("format=bgra");
		filters.push("zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv,format=yuv420p");
	} else if (!isNvenc) {
		// Software encoders (libsvtav1, libvpx-vp9, libvvenc, libopenh264)
		// and AMF/QSV without a fast-path hwctx need system-memory frames in
		// a YUV space they all accept. Download the BGRA D3D11 surface and
		// convert to yuv420p on the CPU. NV12 would be smaller but a few
		// software encoders we list (libvpx-vp9, libvvenc) refuse it; yuv420p
		// is the universally-accepted lowest common denominator.
		filters.push("hwdownload");
		filters.push("format=yuv420p");
	}

	if (needsFps(config)) {
		filters.push(`fps=${config.fps}`);
	}

	return filters.join(",");
};

/**
 * Non-gfxcapture inputs (gdigrab / x11grab / avfoundation): software
 * `scale=` because no hwctx is initialized for these inputs. For
 * software encoders that's optimal anyway. For VAAPI, append the
 * `format=nv12,hwupload` step that the matching `*_vaapi` encoder
 * requires — the device is opened in `buildHwDeviceArgs`.
 *
 * @param {StreamConfig} config
 * @returns {string | null}
 */
const buildInputFilter = (config) => {
	const filters = [];

	if (config.outputWidth && config.outputHeight) {
		filters.push(`scale=${config.outputWidth}:${config.outputHeight}:force_original_aspect_ratio=decrease`);
	}

	if (isVaapiCodec(config.videoCodec)) {
		filters.push("format=nv12", "hwupload");
	}

	if (config.fps) {
		filters.push(`fps=${config.fps}`);
	}

	return filters.length ? filters.join(",") : null;
};

/**
 * Picks the right chain for the configured capture + encoder + hdrMode
 * combination.
 *
 * @param {StreamConfig} config
 * @param {Capabilities} capabilities
 * @returns {string | null}
 */
const selectVideoFilter = (config, capabilities) => {
	if (usesGfxCapture(config, capabilities.platform)) {
		return buildGfxCaptureChain(config);
	}
	return buildInputFilter(config);
};

export { selectVideoFilter, buildGfxCaptureChain, buildInputFilter };
