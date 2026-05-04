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

import { buildArgs, fallbackOnFailure } from "../pipeline.js";
import {
	linuxX11Software,
	macAppleSilicon,
	windowsGdigrabSoftware,
	windowsGfxcaptureSoftware,
	windowsManualInputArgs,
	windowsNvencFastPathNoResize,
	windowsNvencHevcWithAudio,
	windowsQsv,
	windowsRtxNvenc1080p60,
	windowsRtxNvenc1440pHdr,
	windowsRtxNvencDifferentFps,
} from "./fixtures/configs.js";

const winFastPath = { platform: "win32", supportsHwmapCudaFromD3D11: true };
const winLegacy = { platform: "win32", supportsHwmapCudaFromD3D11: false };
const macCaps = { platform: "darwin", supportsHwmapCudaFromD3D11: false };
const linuxCaps = { platform: "linux", supportsHwmapCudaFromD3D11: false };

const tail = () => [
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

const nvencEncoderTail = (preset = "p6") => [
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
	"16000000",
	"-preset",
	preset,
	"-tune",
	"ull",
	"-multipass",
	"fullres",
	"-rc",
	"vbr",
	"-spatial_aq",
	"1",
	"-temporal_aq",
	"1",
	"-cq",
	"23",
	"-b_ref_mode",
	"middle",
	"-bf",
	"3",
	"-rc-lookahead",
	"16",
];

describe("pipeline.buildArgs — Windows + NVENC fast path", () => {
	it("emits the GPU-resident chain with no fps/yuv420p when capture and stream match", () => {
		const result = buildArgs(windowsRtxNvenc1080p60(), winFastPath);

		assert.equal(result.command, "ffmpeg.exe");
		assert.equal(result.usedFastPath, true);
		assert.deepEqual(result.args, [
			"-y",
			"-init_hw_device",
			"d3d11va=dx",
			"-init_hw_device",
			"cuda=cu@dx",
			"-filter_hw_device",
			"cu",
			"-filter_complex",
			"gfxcapture=monitor_idx=0:max_framerate=60:capture_cursor=1:width=1920:height=1080:resize_mode=scale_aspect:output_fmt=nv12,hwmap=derive_device=cuda:mode=read[v]",
			"-map",
			"[v]",
			...nvencEncoderTail(),
			...tail(),
		]);
	});

	it("inserts an fps step in the fast path when capture and stream FPS differ", () => {
		const result = buildArgs(windowsRtxNvencDifferentFps(), winFastPath);
		assert.equal(result.usedFastPath, true);
		assert.ok(result.args.includes("-filter_complex"));
		const filter = result.args[result.args.indexOf("-filter_complex") + 1];
		assert.match(filter, /hwmap=derive_device=cuda:mode=read,fps=30\[v\]/);
	});

	it("omits gfxcapture width/height when no output size is configured", () => {
		const result = buildArgs(windowsNvencFastPathNoResize(), winFastPath);
		assert.equal(result.usedFastPath, true);
		const filter = result.args[result.args.indexOf("-filter_complex") + 1];
		assert.doesNotMatch(filter, /width=/);
		assert.match(filter, /output_fmt=nv12/);
		assert.ok(result.args.includes("-init_hw_device"));
	});

	it("includes audio mapping when audioInputArgs are provided (HEVC)", () => {
		const result = buildArgs(windowsNvencHevcWithAudio(), winFastPath);
		assert.equal(result.usedFastPath, true);
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

describe("pipeline.buildArgs — Windows legacy fallback (CUDA derivation unavailable)", () => {
	it("emits hwdownload + format=bgra + format=yuv420p when supportsHwmapCudaFromD3D11 is false", () => {
		const result = buildArgs(windowsRtxNvenc1080p60(), winLegacy);
		assert.equal(result.usedFastPath, false);
		assert.deepEqual(result.args, [
			"-y",
			"-filter_complex",
			"gfxcapture=monitor_idx=0:max_framerate=60:capture_cursor=1:width=1920:height=1080:resize_mode=scale_aspect:output_fmt=bgra,hwdownload,format=bgra,fps=60,format=yuv420p[v]",
			"-map",
			"[v]",
			...nvencEncoderTail(),
			...tail(),
		]);
	});

	it("uses the SDR-conversion CPU chain when convertStreamToSdr is set", () => {
		const result = buildArgs(windowsRtxNvenc1440pHdr(), winFastPath);
		assert.equal(result.usedFastPath, false);
		const filter = result.args[result.args.indexOf("-filter_complex") + 1];
		assert.match(filter, /hwdownload/);
		assert.match(filter, /tonemap=hable/);
		assert.doesNotMatch(filter, /hwmap=derive_device=cuda/);
	});

	it("fallbackOnFailure(capabilities) flips the fast-path bit off", () => {
		const downgraded = fallbackOnFailure(winFastPath);
		assert.equal(downgraded.platform, "win32");
		assert.equal(downgraded.supportsHwmapCudaFromD3D11, false);
		const result = buildArgs(windowsRtxNvenc1080p60(), downgraded);
		assert.equal(result.usedFastPath, false);
	});
});

describe("pipeline.buildArgs — Windows + software encoder via gfxcapture", () => {
	it("uses the legacy CPU chain (libx264 cannot consume CUDA hwframes)", () => {
		const result = buildArgs(windowsGfxcaptureSoftware(), winFastPath);
		assert.equal(result.usedFastPath, false);
		assert.deepEqual(result.args, [
			"-y",
			"-filter_complex",
			"gfxcapture=monitor_idx=0:max_framerate=60:capture_cursor=1:width=1920:height=1080:resize_mode=scale_aspect:output_fmt=bgra,hwdownload,format=bgra,fps=60,format=yuv420p[v]",
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
			"16000000",
			"-preset",
			"veryfast",
			...tail(),
		]);
	});
});

describe("pipeline.buildArgs — Windows + gdigrab + libx264", () => {
	it("emits a -i input source and a -vf scale chain", () => {
		const result = buildArgs(windowsGdigrabSoftware(), winFastPath);
		assert.equal(result.usedFastPath, false);
		assert.deepEqual(result.args, [
			"-y",
			"-thread_queue_size",
			"1024",
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
			"16000000",
			"-preset",
			"veryfast",
			...tail(),
		]);
	});
});

describe("pipeline.buildArgs — Windows + manual input args", () => {
	it("uses the user-provided input verbatim and skips the gfxcapture filter-source", () => {
		const result = buildArgs(windowsManualInputArgs(), winFastPath);
		assert.equal(result.usedFastPath, false);
		assert.deepEqual(result.args.slice(0, 8), ["-y", "-f", "lavfi", "-i", "testsrc=size=1920x1080:rate=60", "-map", "0:v:0", "-vf"]);
	});
});

describe("pipeline.buildArgs — macOS Apple Silicon (videotoolbox)", () => {
	it("uses avfoundation input and emits -realtime 1", () => {
		const result = buildArgs(macAppleSilicon(), macCaps);
		assert.equal(result.usedFastPath, false);
		assert.deepEqual(result.args, [
			"-y",
			"-thread_queue_size",
			"1024",
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
			"16000000",
			"-realtime",
			"1",
			...tail(),
		]);
	});
});

describe("pipeline.buildArgs — Linux + libx264", () => {
	it("uses x11grab input and CPU filters", () => {
		const result = buildArgs(linuxX11Software(), linuxCaps);
		assert.equal(result.usedFastPath, false);
		assert.deepEqual(result.args.slice(0, 12), [
			"-y",
			"-thread_queue_size",
			"1024",
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
		const result = buildArgs(windowsQsv(), winFastPath);
		assert.equal(result.usedFastPath, false);
		assert.equal(result.args[result.args.indexOf("-c:v") + 1], "h264_qsv");
		assert.equal(result.args[result.args.indexOf("-preset") + 1], "medium");
	});
});
