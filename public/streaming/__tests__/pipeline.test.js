/**
 * Snapshot tests on argv arrays for the streaming pipeline.
 *
 * We never run FFmpeg here; we assert that for known configs the argv
 * matches an expected list byte-for-byte. When defaults change the diff
 * IS the review.
 *
 * Run with `node --test public/streaming/__tests__/pipeline.test.js`.
 */

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { buildArgs } from "../pipeline.js";
import {
	linuxVaapi,
	linuxX11Software,
	macAppleSilicon,
	windowsGdigrabSoftware,
	windowsGfxcaptureSoftware,
	windowsManualInputArgs,
	windowsFileSource,
	windowsNvencNoResize,
	windowsNvencHevcWithAudio,
	windowsQsv,
	windowsRtxNvenc1080p60,
	windowsRtxNvenc1440pHdrConvert,
	windowsRtxNvenc1440pHdrPassthrough,
	windowsRtxNvencDifferentFps,
} from "./fixtures/configs.js";

const winCaps = { platform: "win32" };
const macCaps = { platform: "darwin" };
const linuxCaps = { platform: "linux" };

const tail = (fps = 60) => [
	"-fps_mode",
	"cfr",
	"-r",
	String(fps),
	"-f",
	"hls",
	"-hls_time",
	"2",
	"-hls_list_size",
	"6",
	"-hls_flags",
	"delete_segments+independent_segments+temp_file",
	"-hls_segment_type",
	"fmp4",
	"-hls_fmp4_init_filename",
	"init.mp4",
	"-master_pl_name",
	"master.m3u8",
	"-hls_segment_filename",
	"segment-%06d.m4s",
	"video.m3u8",
];

// Mirrors the new low-latency NVENC defaults from defaults.js:
//   - no -multipass     (nvencMultipass: "disabled" → suppressed by guard in nvenc.js line 34)
//   - -temporal_aq 0    (nvencTemporalAq: false; meaningless without lookahead)
//   - -b_ref_mode disabled
//   - -bf 0
//   - no -rc-lookahead  (nvencLookahead: 0 → suppressed by guard in nvenc.js line 43)
//   - -bufsize 8000000  (vbvMultiplier: 1.0 → 1-second VBV window for live HLS)
const nvencEncoderTail = (preset = "p4") => [
	"-c:v",
	"h264_nvenc",
	"-g",
	"120",
	"-keyint_min",
	"120",
	"-sc_threshold",
	"0",
	"-b:v",
	"8M",
	"-maxrate",
	"8M",
	"-bufsize",
	"8000000",
	"-preset",
	preset,
	"-tune",
	"ull",
	"-rc",
	"vbr",
	"-spatial_aq",
	"1",
	"-temporal_aq",
	"0",
	"-cq",
	"23",
	"-b_ref_mode",
	"disabled",
	"-bf",
	"0",
];

describe("pipeline.buildArgs — Windows + gfxcapture + NVENC (SDR)", () => {
	it("feeds gfxcapture's BGRA D3D11 hwframe straight into NVENC: no -init_hw_device, no hwmap, no hwdownload", () => {
		const result = buildArgs(windowsRtxNvenc1080p60(), winCaps);

		assert.equal(result.command, "ffmpeg.exe");
		assert.deepEqual(result.args, [
			"-y",
			"-filter_complex",
			"gfxcapture=monitor_idx=0:max_framerate=60:capture_cursor=1:width=1920:height=1080:resize_mode=scale_aspect:output_fmt=bgra,fps=60[v]",
			"-map",
			"[v]",
			...nvencEncoderTail(),
			...tail(),
		]);
	});

	it("inserts the fps step when capture and stream FPS differ", () => {
		const result = buildArgs(windowsRtxNvencDifferentFps(), winCaps);
		assert.ok(result.args.includes("-filter_complex"));
		const filter = result.args[result.args.indexOf("-filter_complex") + 1];
		assert.match(filter, /,fps=30\[v\]$/);
	});

	it("omits gfxcapture width/height when no output size is configured", () => {
		const result = buildArgs(windowsNvencNoResize(), winCaps);
		const filter = result.args[result.args.indexOf("-filter_complex") + 1];
		assert.doesNotMatch(filter, /width=/);
		assert.match(filter, /output_fmt=bgra/);
	});

	it("never emits the fictional -init_hw_device cuda=cu@dx or hwmap=derive_device=cuda steps", () => {
		const result = buildArgs(windowsRtxNvenc1080p60(), winCaps);
		const argv = result.args.join(" ");
		assert.doesNotMatch(argv, /cuda=cu@dx/);
		assert.doesNotMatch(argv, /hwmap=derive_device=cuda/);
		assert.doesNotMatch(argv, /-init_hw_device/);
	});

	it("includes audio mapping when audioInputArgs are provided (HEVC)", () => {
		const result = buildArgs(windowsNvencHevcWithAudio(), winCaps);
		assert.ok(result.args.includes("-map"));
		assert.ok(result.args.includes("0:a:0"));
		assert.ok(result.args.includes("-c:v"));
		assert.equal(result.args[result.args.indexOf("-c:v") + 1], "hevc_nvenc");
		assert.ok(result.args.includes("-tag:v"));
		assert.equal(result.args[result.args.indexOf("-tag:v") + 1], "hvc1");
		assert.ok(result.args.includes("-c:a"));
		assert.equal(result.args[result.args.indexOf("-c:a") + 1], "aac");
	});
});

describe("pipeline.buildArgs — Windows + gfxcapture + NVENC + HDR convert", () => {
	it("downloads the BGRA hwframe and tonemaps on CPU via zscale", () => {
		const result = buildArgs(windowsRtxNvenc1440pHdrConvert(), winCaps);
		const filter = result.args[result.args.indexOf("-filter_complex") + 1];
		assert.match(filter, /output_fmt=bgra/);
		assert.match(filter, /,hwdownload,format=bgra,/);
		assert.match(filter, /tonemap=hable/);
		assert.match(filter, /format=yuv420p/);
		assert.doesNotMatch(filter, /hwmap=derive_device=cuda/);
		assert.doesNotMatch(filter, /tonemap_cuda/);
	});

	it("emits BT.709 colour metadata on the encoder args for hdrMode=convert", () => {
		const result = buildArgs(windowsRtxNvenc1440pHdrConvert(), winCaps);
		const args = result.args;
		assert.equal(args[args.indexOf("-color_primaries") + 1], "bt709");
		assert.equal(args[args.indexOf("-color_trc") + 1], "bt709");
		assert.equal(args[args.indexOf("-colorspace") + 1], "bt709");
	});
});

describe("pipeline.buildArgs — Windows + gfxcapture + NVENC + HDR passthrough", () => {
	it("captures X2BGR10 and feeds it straight into NVENC (no hwdownload, no tonemap)", () => {
		const result = buildArgs(windowsRtxNvenc1440pHdrPassthrough(), winCaps);
		const filter = result.args[result.args.indexOf("-filter_complex") + 1];
		assert.match(filter, /output_fmt=x2bgr10/);
		assert.doesNotMatch(filter, /hwdownload/);
		assert.doesNotMatch(filter, /tonemap/);
		assert.doesNotMatch(filter, /hwmap=derive_device=cuda/);
	});

	it("emits BT.2020/PQ colour metadata and pins -profile:v main10 for HEVC passthrough", () => {
		const result = buildArgs(windowsRtxNvenc1440pHdrPassthrough(), winCaps);
		const args = result.args;
		assert.equal(args[args.indexOf("-color_primaries") + 1], "bt2020");
		assert.equal(args[args.indexOf("-color_trc") + 1], "smpte2084");
		assert.equal(args[args.indexOf("-colorspace") + 1], "bt2020nc");
		assert.equal(args[args.indexOf("-profile:v") + 1], "main10");
	});
});

describe("pipeline.buildArgs — Windows + gfxcapture + software encoder", () => {
	it("downloads the BGRA hwframe and converts to yuv420p before libx264", () => {
		const result = buildArgs(windowsGfxcaptureSoftware(), winCaps);
		assert.deepEqual(result.args, [
			"-y",
			"-filter_complex",
			"gfxcapture=monitor_idx=0:max_framerate=60:capture_cursor=1:width=1920:height=1080:resize_mode=scale_aspect:output_fmt=bgra,hwdownload,format=yuv420p,fps=60[v]",
			"-map",
			"[v]",
			"-c:v",
			"libx264",
			"-x264-params",
			"keyint=120:min-keyint=120:scenecut=0",
			"-b:v",
			"8M",
			"-maxrate",
			"8M",
			"-bufsize",
			"8000000",
			"-preset",
			"veryfast",
			...tail(),
		]);
	});
});

describe("pipeline.buildArgs — Windows + gdigrab + libx264", () => {
	it("emits a -i input source and a -vf scale chain", () => {
		const result = buildArgs(windowsGdigrabSoftware(), winCaps);
		assert.deepEqual(result.args, [
			"-y",
			"-thread_queue_size",
			"1024",
			"-rtbufsize",
			"256M",
			"-f",
			"gdigrab",
			"-framerate",
			"60",
			"-draw_mouse",
			"1",
			"-i",
			"desktop",
			"-map",
			"0:v:0",
			"-vf",
			"scale=1920:1080:force_original_aspect_ratio=decrease,fps=60",
			"-c:v",
			"libx264",
			"-x264-params",
			"keyint=120:min-keyint=120:scenecut=0",
			"-b:v",
			"8M",
			"-maxrate",
			"8M",
			"-bufsize",
			"8000000",
			"-preset",
			"veryfast",
			...tail(),
		]);
	});
});

describe("pipeline.buildArgs — Windows + manual input args", () => {
	it("uses the user-provided input verbatim and skips the gfxcapture filter-source", () => {
		const result = buildArgs(windowsManualInputArgs(), winCaps);
		assert.deepEqual(result.args.slice(0, 8), ["-y", "-f", "lavfi", "-i", "testsrc=size=1920x1080:rate=60", "-map", "0:v:0", "-vf"]);
	});
});

describe("pipeline.buildArgs — file source mode", () => {
	it("uses -re + -stream_loop and skips desktop capture args", () => {
		const result = buildArgs(windowsFileSource(), winCaps);
		assert.deepEqual(result.args.slice(0, 7), ["-y", "-re", "-stream_loop", "-1", "-i", "C:/videos/demo.mp4", "-map"]);
		const argv = result.args.join(" ");
		assert.doesNotMatch(argv, /\bgdigrab\b/);
		assert.doesNotMatch(argv, /\bgfxcapture=/);
	});
});

describe("pipeline.buildArgs — macOS Apple Silicon (videotoolbox)", () => {
	it("uses avfoundation input and emits -realtime 1", () => {
		const result = buildArgs(macAppleSilicon(), macCaps);
		assert.deepEqual(result.args, [
			"-y",
			"-thread_queue_size",
			"1024",
			"-rtbufsize",
			"256M",
			"-f",
			"avfoundation",
			"-framerate",
			"60",
			"-capture_cursor",
			"1",
			"-i",
			"1:none",
			"-map",
			"0:v:0",
			"-vf",
			"scale=1920:1080:force_original_aspect_ratio=decrease,fps=60",
			"-c:v",
			"h264_videotoolbox",
			"-g",
			"120",
			"-keyint_min",
			"120",
			"-sc_threshold",
			"0",
			"-b:v",
			"8M",
			"-maxrate",
			"8M",
			"-bufsize",
			"8000000",
			"-realtime",
			"1",
			...tail(),
		]);
	});
});

describe("pipeline.buildArgs — Linux + libx264", () => {
	it("uses x11grab input and CPU filters", () => {
		const result = buildArgs(linuxX11Software(), linuxCaps);
		assert.deepEqual(result.args.slice(0, 14), [
			"-y",
			"-thread_queue_size",
			"1024",
			"-rtbufsize",
			"256M",
			"-f",
			"x11grab",
			"-framerate",
			"30",
			"-draw_mouse",
			"1",
			"-i",
			process.env.DISPLAY || ":0.0",
			"-map",
		]);
		assert.ok(result.args.includes("-vf"));
		assert.ok(result.args.includes("-preset"));
	});
});

describe("pipeline.buildArgs — Windows + QSV", () => {
	it("emits qsv codec args with -preset", () => {
		const result = buildArgs(windowsQsv(), winCaps);
		assert.equal(result.args[result.args.indexOf("-c:v") + 1], "h264_qsv");
		assert.equal(result.args[result.args.indexOf("-preset") + 1], "medium");
	});
});

describe("pipeline.buildArgs — Linux + VAAPI", () => {
	it("opens a VA-API device and binds it to the filter graph", () => {
		const result = buildArgs(linuxVaapi(), linuxCaps);
		const args = result.args;
		const initIdx = args.indexOf("-init_hw_device");
		assert.notEqual(initIdx, -1, "expected -init_hw_device to be set for VAAPI");
		assert.equal(args[initIdx + 1], "vaapi=va:/dev/dri/renderD128");
		const filterIdx = args.indexOf("-filter_hw_device");
		assert.notEqual(filterIdx, -1, "expected -filter_hw_device to bind the VA-API device to the filter graph");
		assert.equal(args[filterIdx + 1], "va");
	});

	it("appends format=nv12,hwupload to -vf so the encoder receives VAAPI surfaces", () => {
		const result = buildArgs(linuxVaapi(), linuxCaps);
		const vfIdx = result.args.indexOf("-vf");
		assert.notEqual(vfIdx, -1, "expected -vf chain on the x11grab+vaapi path");
		const vf = result.args[vfIdx + 1];
		// CPU scale runs first, then format conversion + upload, then fps.
		assert.match(vf, /^scale=1920:1080:force_original_aspect_ratio=decrease,format=nv12,hwupload,fps=30$/);
	});

	it("selects h264_vaapi as the encoder", () => {
		const result = buildArgs(linuxVaapi(), linuxCaps);
		assert.equal(result.args[result.args.indexOf("-c:v") + 1], "h264_vaapi");
	});

	it("honours config.vaapiDevice when provided", () => {
		const config = linuxVaapi();
		config.vaapiDevice = "/dev/dri/renderD129";
		const result = buildArgs(config, linuxCaps);
		const initIdx = result.args.indexOf("-init_hw_device");
		assert.equal(result.args[initIdx + 1], "vaapi=va:/dev/dri/renderD129");
	});
});

describe("pipeline.buildArgs — resize is performed in the cheapest place for each path", () => {
	it("gfxcapture's D3D11 video processor does convert + resize in one pass (no scale_cuda, no software scale)", () => {
		const result = buildArgs(windowsRtxNvenc1080p60(), winCaps);
		const filter = result.args[result.args.indexOf("-filter_complex") + 1];
		assert.match(filter, /width=1920:height=1080:resize_mode=scale_aspect:output_fmt=bgra/);
		assert.doesNotMatch(filter, /scale_cuda/);
		assert.doesNotMatch(filter, /\bscale=/);
	});

	it("HDR convert: still BGRA capture because zscale's tonemap operates in RGB space", () => {
		const result = buildArgs(windowsRtxNvenc1440pHdrConvert(), winCaps);
		const filter = result.args[result.args.indexOf("-filter_complex") + 1];
		assert.match(filter, /output_fmt=bgra/);
		assert.match(filter, /tonemap=hable/);
	});

	it("non-gfxcapture inputs use software scale= (no hwctx is initialized for them)", () => {
		const result = buildArgs(windowsGdigrabSoftware(), winCaps);
		assert.ok(result.args.includes("-vf"));
		const vf = result.args[result.args.indexOf("-vf") + 1];
		assert.match(vf, /^scale=1920:1080:force_original_aspect_ratio=decrease/);
	});
});

describe("pipeline.buildArgs — recording-rate ceiling (fps + 15 %)", () => {
	it("clamps gfxcapture max_framerate to ceil(fps * 1.15) when captureFps is higher", () => {
		const config = windowsRtxNvenc1080p60();
		config.captureFps = 240;
		config.fps = 120;
		const result = buildArgs(config, winCaps);
		const filter = result.args[result.args.indexOf("-filter_complex") + 1];
		assert.match(filter, /max_framerate=138\b/);
		assert.match(filter, /,fps=120\[v\]/);
	});

	it("leaves gfxcapture max_framerate alone when captureFps is already below the ceiling", () => {
		const config = windowsRtxNvenc1080p60();
		config.captureFps = 30;
		config.fps = 120;
		const result = buildArgs(config, winCaps);
		const filter = result.args[result.args.indexOf("-filter_complex") + 1];
		assert.match(filter, /max_framerate=30\b/);
	});

	it("clamps gdigrab -framerate to the same ceiling", () => {
		const config = windowsGdigrabSoftware();
		config.captureFps = 240;
		config.fps = 60;
		const result = buildArgs(config, winCaps);
		const idx = result.args.indexOf("-framerate");
		assert.notEqual(idx, -1);
		assert.equal(result.args[idx + 1], "69");
	});
});
