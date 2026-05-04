import { spawn } from "child_process";
import { createHash } from "crypto";
import { mkdir, readdir, readFile, rm, stat, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join, relative } from "path";

const UPLOAD_POLL_INTERVAL_MS = 750;
const SEGMENT_EXTENSIONS = new Set([".aac", ".m4a", ".m4s", ".mp3", ".mp4", ".ts"]);
const VIDEO_CODEC_OPTIONS = [
	"av1_nvenc",
	"hevc_nvenc",
	"h264_nvenc",
	"av1_qsv",
	"vp9_qsv",
	"hevc_qsv",
	"h264_qsv",
	"libsvtav1",
	"libaom-av1",
	"libvpx-vp9",
	"libx265",
	"libx264",
	"hevc_videotoolbox",
	"h264_videotoolbox",
];
const AUDIO_CODEC_OPTIONS = ["aac", "libmp3lame"];
const CAPTURE_BACKEND_OPTIONS = ["gfxcapture", "gdigrab"];
const NVENC_CODECS = new Set(["h264_nvenc", "hevc_nvenc", "av1_nvenc"]);
const SOFTWARE_VIDEO_CODECS = new Set(["libx264", "libx265", "libaom-av1", "libsvtav1"]);
const QSV_VIDEO_CODECS = new Set(["h264_qsv", "hevc_qsv", "av1_qsv", "vp9_qsv"]);
const VIDEOTOOLBOX_VIDEO_CODECS = new Set(["h264_videotoolbox", "hevc_videotoolbox"]);
const HEVC_VIDEO_CODECS = new Set(["libx265", "hevc_nvenc", "hevc_qsv", "hevc_videotoolbox"]);
const H264_VIDEO_CODECS = new Set(["libx264", "h264_nvenc", "h264_qsv", "h264_videotoolbox"]);
const AV1_VIDEO_CODECS = new Set(["av1_nvenc", "av1_qsv", "libaom-av1", "libsvtav1"]);
const VP9_VIDEO_CODECS = new Set(["libvpx-vp9", "vp9_qsv"]);
const NVENC_PRESET_LADDER = ["p7", "p6", "p5", "p4", "p3", "p2", "p1"];
const SOFTWARE_PRESETS = ["ultrafast", "superfast", "veryfast", "faster", "fast", "medium", "slow", "slower", "veryslow", "placebo"];
const SVT_AV1_PRESETS = Array.from({ length: 13 }, (_value, index) => String(index));
const LIBAOM_AV1_PRESETS = Array.from({ length: 9 }, (_value, index) => String(index));
const LIBVPX_VP9_PRESETS = Array.from({ length: 9 }, (_value, index) => String(index));
const QSV_PRESETS = ["veryfast", "faster", "fast", "medium", "slow", "slower", "veryslow"];
const VIDEOTOOLBOX_PRESETS = ["realtime"];
const NVENC_TUNE_OPTIONS = ["hq", "ll", "ull", "lossless"];
const NVENC_MULTIPASS_OPTIONS = ["disabled", "qres", "fullres"];
const NVENC_RC_OPTIONS = ["vbr", "cbr", "constqp"];
const NVENC_B_REF_MODE_OPTIONS = ["disabled", "each", "middle"];
const NVENC_PRESET_ALIASES = {
	slowest: "p7",
	slower: "p7",
	slow: "p6",
	medium: "p5",
	fast: "p4",
	faster: "p3",
	fastest: "p1",
	hq: "p6",
	ll: "p4",
	ull: "p3",
	lossless: "p7",
};
const ENCODER_PRESETS = {
	nvenc: NVENC_PRESET_LADDER,
	software: SOFTWARE_PRESETS,
	svt_av1: SVT_AV1_PRESETS,
	libaom_av1: LIBAOM_AV1_PRESETS,
	libvpx_vp9: LIBVPX_VP9_PRESETS,
	qsv: QSV_PRESETS,
	videotoolbox: VIDEOTOOLBOX_PRESETS,
};
const DEFAULT_ENCODER_PRESETS = {
	nvenc: "p6",
	software: "medium",
	svt_av1: "8",
	libaom_av1: "6",
	libvpx_vp9: "5",
	qsv: "medium",
	videotoolbox: "realtime",
};
const DEFAULT_SETTINGS = {
	websiteBaseUrl: (!process?.env?.NODE_ENV || process?.env?.NODE_ENV === "development") ? "http://localhost:6001" : "https://rebound.nexus",
	liveCreateToken: "",
	authToken: "",
	sessionLabel: "",
	retainSegmentCount: 5,
	ffmpegPath: window?.ffmpegPath || "ffmpeg.exe",
	ffprobePath: window?.ffprobePath || "ffprobe.exe",
	source: null,
	captureBackend: "gfxcapture",
	captureFps: 30,
	manualInputArgs: "",
	audioInputArgs: "",
	mapSourceAudio: false,
	drawMouse: true,
	videoCodec: "h264_nvenc",
	audioCodec: "aac",
	outputWidth: 1920,
	outputHeight: 1080,
	videoBitrate: "8M",
	audioBitrate: "160k",
	fps: 30,
	encoderPreset: "p6",
	nvencTune: "ull",
	nvencMultipass: "fullres",
	nvencRc: "vbr",
	nvencCq: 23,
	nvencSpatialAq: true,
	nvencTemporalAq: true,
	nvencBRefMode: "middle",
	nvencBFrames: 3,
	nvencLookahead: 16,
	gopSize: 60,
	hlsTime: "2",
	hlsListSize: 6,
	convertStreamToSdr: false,
	openSharePage: true,
};

const lower = (value) =>
	String(value || "")
		.trim()
		.toLowerCase();

const parseOptionalPositiveInt = (value, label) => {
	if (value === "" || value === null || value === undefined) return null;
	const number = Number.parseInt(String(value), 10);
	if (!Number.isFinite(number) || number < 0) {
		throw new Error(`${label} must be 0 or greater.`);
	}
	return number;
};

const parsePositiveInt = (value, label) => {
	const number = Number.parseInt(String(value), 10);
	if (!Number.isFinite(number) || number <= 0) {
		throw new Error(`${label} must be greater than 0.`);
	}
	return number;
};

const parsePositiveFloat = (value, label) => {
	const number = Number.parseFloat(String(value));
	if (!Number.isFinite(number) || number <= 0) {
		throw new Error(`${label} must be greater than 0.`);
	}
	return number;
};

const normalizeChoice = (value, allowed, fallback, label) => {
	const normalized = lower(value || fallback);
	if (!allowed.includes(normalized)) {
		throw new Error(`${label} must be one of ${allowed.join(", ")}.`);
	}
	return normalized;
};

const isNvencCodec = (videoCodec) => NVENC_CODECS.has(lower(videoCodec));
const isSoftwareCodec = (videoCodec) => SOFTWARE_VIDEO_CODECS.has(lower(videoCodec));
const isQsvCodec = (videoCodec) => QSV_VIDEO_CODECS.has(lower(videoCodec));
const isVideotoolboxCodec = (videoCodec) => VIDEOTOOLBOX_VIDEO_CODECS.has(lower(videoCodec));
const isHevcCodec = (videoCodec) => HEVC_VIDEO_CODECS.has(lower(videoCodec));
const isAv1Codec = (videoCodec) => AV1_VIDEO_CODECS.has(lower(videoCodec));
const isVp9Codec = (videoCodec) => VP9_VIDEO_CODECS.has(lower(videoCodec));

const codecFamily = (videoCodec) => {
	const codec = lower(videoCodec);
	if (NVENC_CODECS.has(codec)) return "nvenc";
	if (codec === "libsvtav1") return "svt_av1";
	if (codec === "libaom-av1") return "libaom_av1";
	if (codec === "libvpx-vp9") return "libvpx_vp9";
	if (SOFTWARE_VIDEO_CODECS.has(codec)) return "software";
	if (QSV_VIDEO_CODECS.has(codec)) return "qsv";
	if (VIDEOTOOLBOX_VIDEO_CODECS.has(codec)) return "videotoolbox";
	throw new Error(`Video codec must be one of ${VIDEO_CODEC_OPTIONS.join(", ")}.`);
};

const normalizeNvencPreset = (value) => {
	const normalized = NVENC_PRESET_ALIASES[lower(value)] || lower(value || DEFAULT_ENCODER_PRESETS.nvenc);
	if (!NVENC_PRESET_LADDER.includes(normalized)) {
		throw new Error(`NVENC preset must be one of ${NVENC_PRESET_LADDER.join(", ")}.`);
	}
	return normalized;
};

const normalizeEncoderPreset = (videoCodec, value) => {
	const family = codecFamily(videoCodec);
	if (family === "nvenc") return normalizeNvencPreset(value);

	const allowed = ENCODER_PRESETS[family];
	const fallback = DEFAULT_ENCODER_PRESETS[family];
	return normalizeChoice(value, allowed, fallback, `${videoCodec} preset`);
};

const normalizeAudioCodec = (value) => {
	let codec = lower(value);
	if (codec === "mp3") codec = "libmp3lame";
	if (!AUDIO_CODEC_OPTIONS.includes(codec)) {
		throw new Error(`Audio codec must be one of ${AUDIO_CODEC_OPTIONS.join(", ")}.`);
	}
	return codec;
};

const parseBitrateToBps = (value) => {
	const text = lower(value);
	if (text.endsWith("k")) return Math.round(Number.parseFloat(text.slice(0, -1)) * 1000);
	if (text.endsWith("m")) return Math.round(Number.parseFloat(text.slice(0, -1)) * 1_000_000);
	const parsed = Number.parseInt(text, 10);
	if (!Number.isFinite(parsed) || parsed <= 0) {
		throw new Error("Bitrate must be a positive number, or use k/m suffixes.");
	}
	return parsed;
};

const codecString = (videoCodec, audioCodec, includeAudio) => {
	const codecs = [];
	const normalizedVideo = lower(videoCodec);
	const normalizedAudio = lower(audioCodec);

	if (HEVC_VIDEO_CODECS.has(normalizedVideo)) codecs.push("hvc1");
	else if (H264_VIDEO_CODECS.has(normalizedVideo)) codecs.push("avc1");
	else if (AV1_VIDEO_CODECS.has(normalizedVideo)) codecs.push("av01");
	else if (VP9_VIDEO_CODECS.has(normalizedVideo)) codecs.push("vp09");

	if (includeAudio && normalizedAudio === "aac") codecs.push("mp4a.40.2");
	else if (includeAudio && normalizedAudio === "libmp3lame") codecs.push("mp4a.40.34");

	return codecs.join(",");
};

const extensionForName = (filename) => {
	const index = filename.lastIndexOf(".");
	return index >= 0 ? filename.slice(index).toLowerCase() : "";
};

const escapeFilterValue = (value) =>
	String(value || "")
		.replace(/\\/g, "\\\\")
		.replace(/'/g, "\\'")
		.replace(/:/g, "\\:");

const escapeRegex = (value) => String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const sourceNameToCaseInsensitiveRegex = (name) => `(?i)^${escapeRegex(name)}$`;

const parseElectronScreenIndex = (sourceId) => {
	const match = String(sourceId || "").match(/^screen:(\d+)/);
	return match ? Number.parseInt(match[1], 10) : 0;
};

const splitCommandLine = (value) => {
	const input = String(value || "").trim();
	if (!input) return [];

	const args = [];
	let token = "";
	let quote = "";
	let escaping = false;

	for (const char of input) {
		if (escaping) {
			token += char;
			escaping = false;
			continue;
		}

		if (char === "\\") {
			escaping = true;
			continue;
		}

		if (quote) {
			if (char === quote) {
				quote = "";
			} else {
				token += char;
			}
			continue;
		}

		if (char === '"' || char === "'") {
			quote = char;
			continue;
		}

		if (/\s/.test(char)) {
			if (token) {
				args.push(token);
				token = "";
			}
			continue;
		}

		token += char;
	}

	if (escaping) token += "\\";
	if (quote) throw new Error("Command line arguments contain an unterminated quote.");
	if (token) args.push(token);

	return args;
};

const parseResponseBody = async (response) => {
	const text = await response.text();
	try {
		return text ? JSON.parse(text) : {};
	} catch (_err) {
		return { message: text };
	}
};

const raiseForStatus = async (response) => {
	if (response.ok) return parseResponseBody(response);

	const payload = await parseResponseBody(response);
	const detail = payload?.error || payload?.message || response.statusText;
	const err = new Error(`${response.status} ${response.url}: ${detail}`);
	err.status = response.status;
	err.payload = payload;
	throw err;
};

const serializeSource = (source) => ({
	id: source.id,
	name: source.name,
	displayId: source.display_id || "",
	thumbnail: source.thumbnail?.toDataURL?.() || "",
	appIcon: source.appIcon?.toDataURL?.() || "",
});

class ElectronLiveStreamManager {
	constructor({ app, desktopCapturer, shell, sendToRenderer, logger }) {
		this.app = app;
		this.desktopCapturer = desktopCapturer;
		this.shell = shell;
		this.sendToRenderer = sendToRenderer;
		this.logger = logger;
		this.status = "idle";
		this.error = "";
		this.activeConfig = null;
		this.sessionInfo = null;
		this.ffmpegProcess = null;
		this.uploadTimer = null;
		this.uploadInFlight = false;
		this.lastUploaded = new Map();
		this.lastHeartbeatAt = 0;
		this.stopping = false;
		this.logBuffer = "";
	}

	getState() {
		return {
			status: this.status,
			error: this.error,
			sessionInfo: this.sessionInfo,
			ffmpegPid: this.ffmpegProcess?.pid || null,
			startedAt: this.activeConfig?.startedAt || null,
			source: this.activeConfig?.source || null,
		};
	}

	setState(status, extra = {}) {
		this.status = status;
		if ("error" in extra) this.error = extra.error || "";
		this.sendToRenderer("live-stream-state", this.getState());
	}

	log(message) {
		const payload = {
			message,
			timestamp: new Date().toISOString(),
		};
		this.logger?.info?.(`[live-stream] ${message}`);
		this.sendToRenderer("live-stream-log", payload);
	}

	async getDesktopSources(options = {}) {
		const requestedTypes = Array.isArray(options.types) && options.types.length ? options.types : ["screen", "window"];
		const types = requestedTypes.filter((type) => type === "screen" || type === "window");
		const sources = await this.desktopCapturer.getSources({
			types: types.length ? types : ["screen", "window"],
			fetchWindowIcons: true,
			thumbnailSize: {
				width: Number.parseInt(options.thumbnailWidth, 10) || 320,
				height: Number.parseInt(options.thumbnailHeight, 10) || 180,
			},
		});

		return sources.map(serializeSource);
	}

	normalizeConfig(rawConfig = {}) {
		const config = {
			...DEFAULT_SETTINGS,
			...rawConfig,
		};

		const videoCodec = lower(config.videoCodec);
		codecFamily(videoCodec);
		const encoderPreset = normalizeEncoderPreset(videoCodec, config.encoderPreset);
		const outputWidth = parseOptionalPositiveInt(config.outputWidth, "Width");
		const outputHeight = parseOptionalPositiveInt(config.outputHeight, "Height");
		const fps = parseOptionalPositiveInt(config.fps, "Output FPS");
		const captureFps = parsePositiveInt(config.captureFps || fps || DEFAULT_SETTINGS.captureFps, "Capture FPS");
		const audioInputArgs = splitCommandLine(config.audioInputArgs);
		const manualInputArgs = splitCommandLine(config.manualInputArgs);

		if (!manualInputArgs.length && !config.source?.id) {
			throw new Error("Choose a desktop source or provide manual FFmpeg input arguments.");
		}

		parseBitrateToBps(config.videoBitrate);
		parseBitrateToBps(config.audioBitrate);

		return {
			...config,
			websiteBaseUrl: String(config.websiteBaseUrl || DEFAULT_SETTINGS.websiteBaseUrl)
				.trim()
				.replace(/\/+$/, ""),
			liveCreateToken: String(config.liveCreateToken || "").trim(),
			authToken: String(config.authToken || "").trim(),
			sessionLabel: String(config.sessionLabel || "").trim(),
			retainSegmentCount: parsePositiveInt(config.retainSegmentCount, "Retain segments"),
			ffmpegPath: String(config.ffmpegPath || "ffmpeg").trim(),
			source: config.source || null,
			captureBackend: normalizeChoice(config.captureBackend, CAPTURE_BACKEND_OPTIONS, DEFAULT_SETTINGS.captureBackend, "Capture backend"),
			captureFps,
			manualInputArgs,
			audioInputArgs,
			mapSourceAudio: Boolean(config.mapSourceAudio),
			drawMouse: Boolean(config.drawMouse),
			videoCodec,
			audioCodec: normalizeAudioCodec(config.audioCodec),
			outputWidth,
			outputHeight,
			videoBitrate: String(config.videoBitrate || DEFAULT_SETTINGS.videoBitrate).trim(),
			audioBitrate: String(config.audioBitrate || DEFAULT_SETTINGS.audioBitrate).trim(),
			fps,
			encoderPreset,
			nvencTune: normalizeChoice(config.nvencTune, NVENC_TUNE_OPTIONS, DEFAULT_SETTINGS.nvencTune, "NVENC tune"),
			nvencMultipass: normalizeChoice(config.nvencMultipass, NVENC_MULTIPASS_OPTIONS, DEFAULT_SETTINGS.nvencMultipass, "NVENC multipass"),
			nvencRc: normalizeChoice(config.nvencRc, NVENC_RC_OPTIONS, DEFAULT_SETTINGS.nvencRc, "NVENC rate control"),
			nvencCq: parseOptionalPositiveInt(config.nvencCq, "NVENC CQ"),
			nvencSpatialAq: Boolean(config.nvencSpatialAq),
			nvencTemporalAq: Boolean(config.nvencTemporalAq),
			nvencBRefMode: normalizeChoice(config.nvencBRefMode, NVENC_B_REF_MODE_OPTIONS, DEFAULT_SETTINGS.nvencBRefMode, "NVENC B-ref mode"),
			nvencBFrames: parseOptionalPositiveInt(config.nvencBFrames, "NVENC B-frames"),
			nvencLookahead: parseOptionalPositiveInt(config.nvencLookahead, "NVENC lookahead"),
			gopSize: parsePositiveInt(config.gopSize, "GOP size"),
			hlsTime: String(parsePositiveFloat(config.hlsTime, "HLS segment seconds")),
			hlsListSize: parsePositiveInt(config.hlsListSize, "HLS playlist size"),
			convertStreamToSdr: Boolean(config.convertStreamToSdr),
			openSharePage: Boolean(config.openSharePage),
			startedAt: new Date().toISOString(),
			remoteDir: join(tmpdir(), `rebound-live-${Date.now()}-${Math.round(Math.random() * 1_000_000)}`),
		};
	}

	async createSession(config) {
		const headers = {
			"Content-Type": "application/json",
		};

		if (config.authToken) {
			headers.Authorization = `Bearer ${config.authToken}`;
		}

		if (config.liveCreateToken) {
			headers["X-Live-Create-Token"] = config.liveCreateToken;
			if (!headers.Authorization) {
				headers.Authorization = `Bearer ${config.liveCreateToken}`;
			}
		}

		if (!headers.Authorization && !headers["X-Live-Create-Token"]) {
			throw new Error("Log in before streaming, or provide a live create token.");
		}

		const response = await fetch(`${config.websiteBaseUrl}/live/api/session`, {
			method: "POST",
			headers,
			body: JSON.stringify({
				label: config.sessionLabel,
				retainSegmentCount: config.retainSegmentCount,
			}),
		});
		const data = await raiseForStatus(response);
		const heartbeatIntervalMs = Number.parseInt(data.heartbeatIntervalMs, 10) || 15000;

		for (const key of ["sessionId", "publicToken", "ingestSecret", "playbackUrl", "shareUrl"]) {
			if (!data[key]) {
				throw new Error(`Unexpected live session response: missing ${key}.`);
			}
		}

		return {
			sessionId: data.sessionId,
			publicToken: data.publicToken,
			ingestSecret: data.ingestSecret,
			status: data.status,
			playbackUrl: data.playbackUrl,
			shareUrl: data.shareUrl,
			heartbeatIntervalMs,
			expiresAt: data.expiresAt,
		};
	}

	usesGfxCapture(config) {
		return process.platform === "win32" && config.captureBackend === "gfxcapture" && !config.manualInputArgs.length;
	}

	buildCaptureInputArgs(config) {
		if (config.manualInputArgs.length) return config.manualInputArgs;

		const sourceName = config.source?.name || "desktop";
		const sourceId = config.source?.id || "";
		const args = ["-thread_queue_size", "1024"];

		if (process.platform === "win32") {
			args.push("-f", "gdigrab", "-framerate", String(config.captureFps), "-draw_mouse", config.drawMouse ? "1" : "0");
			args.push("-i", sourceId.startsWith("window:") ? `title=${sourceName}` : "desktop");
			return args;
		}

		if (process.platform === "darwin") {
			args.push("-f", "avfoundation", "-framerate", String(config.captureFps), "-capture_cursor", config.drawMouse ? "1" : "0", "-i", "1:none");
			return args;
		}

		args.push("-f", "x11grab", "-framerate", String(config.captureFps), "-draw_mouse", config.drawMouse ? "1" : "0", "-i", process.env.DISPLAY || ":0.0");
		return args;
	}

	buildGfxCaptureSourceFilter(config) {
		const sourceName = config.source?.name || "";
		const sourceId = config.source?.id || "";
		const options = [];

		if (sourceId.startsWith("screen:")) {
			options.push(`monitor_idx=${parseElectronScreenIndex(sourceId)}`);
		} else {
			options.push(`window_title='${escapeFilterValue(sourceNameToCaseInsensitiveRegex(sourceName))}'`);
		}

		options.push(`max_framerate=${config.captureFps}`);
		options.push(`capture_cursor=${config.drawMouse ? "1" : "0"}`);

		if (config.outputWidth && config.outputHeight) {
			options.push(`width=${config.outputWidth}`);
			options.push(`height=${config.outputHeight}`);
			options.push("resize_mode=scale_aspect");
		}

		options.push("output_fmt=bgra");
		return `gfxcapture=${options.join(":")}`;
	}

	buildStreamVideoFilter(config, { includeCaptureSource = false } = {}) {
		const filters = [];
		const usingGfxCapture = includeCaptureSource && this.usesGfxCapture(config);

		if (usingGfxCapture) {
			filters.push(this.buildGfxCaptureSourceFilter(config));
			filters.push("hwdownload");
			filters.push("format=bgra");
		}

		if (config.convertStreamToSdr) {
			filters.push("zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv,format=yuv420p");
		}

		if (!usingGfxCapture && config.outputWidth && config.outputHeight) {
			filters.push(`scale=${config.outputWidth}:${config.outputHeight}:force_original_aspect_ratio=decrease`);
		}

		if (config.fps) {
			filters.push(`fps=${config.fps}`);
		}

		if (usingGfxCapture && !config.convertStreamToSdr) {
			filters.push("format=yuv420p");
		}

		return filters.length ? filters.join(",") : null;
	}

	buildFfmpegCommand(config) {
		const cmd = [config.ffmpegPath, "-y"];
		const usingGfxCapture = this.usesGfxCapture(config);

		if (!usingGfxCapture) {
			cmd.push(...this.buildCaptureInputArgs(config));
		}

		if (config.audioInputArgs.length) {
			cmd.push("-thread_queue_size", "1024", ...config.audioInputArgs);
		}

		if (usingGfxCapture) {
			const videoFilter = this.buildStreamVideoFilter(config, { includeCaptureSource: true });
			cmd.push("-filter_complex", `${videoFilter}[v]`);
			cmd.push("-map", "[v]");
			if (config.audioInputArgs.length) {
				cmd.push("-map", "0:a:0");
			} else if (config.mapSourceAudio) {
				this.log("Source audio mapping is not available with gfxcapture; provide audioInputArgs for audio capture.");
			}
		} else {
			cmd.push("-map", "0:v:0");
			if (config.audioInputArgs.length) {
				cmd.push("-map", "1:a:0");
			} else if (config.mapSourceAudio) {
				cmd.push("-map", "0:a?");
			}

			const videoFilter = this.buildStreamVideoFilter(config);
			if (videoFilter) {
				cmd.push("-vf", videoFilter);
			}
		}

		const videoCodec = config.videoCodec;
		const encoderPreset = normalizeEncoderPreset(videoCodec, config.encoderPreset);
		const gopSize = String(config.gopSize);

		cmd.push("-c:v", videoCodec);
		if (isHevcCodec(videoCodec)) cmd.push("-tag:v", "hvc1");
		else if (isAv1Codec(videoCodec)) cmd.push("-tag:v", "av01");
		else if (isVp9Codec(videoCodec)) cmd.push("-tag:v", "vp09");

		if (videoCodec === "libx265") {
			cmd.push("-x265-params", `repeat-headers=1:keyint=${gopSize}:min-keyint=${gopSize}:scenecut=0`);
		} else if (videoCodec === "libx264") {
			cmd.push("-x264-params", `keyint=${gopSize}:min-keyint=${gopSize}:scenecut=0`);
		} else if (videoCodec === "libsvtav1") {
			cmd.push("-g", gopSize, "-svtav1-params", `keyint=${gopSize}:scd=0`);
		} else if (videoCodec === "libaom-av1") {
			cmd.push("-g", gopSize, "-keyint_min", gopSize, "-cpu-used", encoderPreset);
		} else if (videoCodec === "libvpx-vp9") {
			cmd.push("-g", gopSize, "-keyint_min", gopSize, "-deadline", "realtime", "-cpu-used", encoderPreset, "-row-mt", "1", "-lag-in-frames", "0");
		} else {
			cmd.push("-g", gopSize, "-keyint_min", gopSize, "-sc_threshold", "0");
		}

		if (videoCodec === "libvpx-vp9") {
			cmd.push("-pix_fmt", "yuv420p");
		}

		cmd.push("-b:v", config.videoBitrate, "-maxrate", config.videoBitrate, "-bufsize", String(parseBitrateToBps(config.videoBitrate) * 2));

		if (isNvencCodec(videoCodec)) {
			cmd.push("-preset", normalizeNvencPreset(encoderPreset), "-tune", config.nvencTune);
			if (config.nvencMultipass !== "disabled") cmd.push("-multipass", config.nvencMultipass);
			cmd.push("-rc", config.nvencRc);
			cmd.push("-spatial_aq", config.nvencSpatialAq ? "1" : "0");
			cmd.push("-temporal_aq", config.nvencTemporalAq ? "1" : "0");
			if (config.nvencCq !== null && ["vbr", "constqp"].includes(config.nvencRc)) cmd.push("-cq", String(config.nvencCq));
			cmd.push("-b_ref_mode", config.nvencBRefMode === "disabled" ? "disabled" : config.nvencBRefMode);
			if (config.nvencBFrames !== null) cmd.push("-bf", String(config.nvencBFrames));
			if (config.nvencLookahead !== null && config.nvencLookahead > 0) cmd.push("-rc-lookahead", String(config.nvencLookahead));
		} else if (videoCodec === "libsvtav1" || isSoftwareCodec(videoCodec) || isQsvCodec(videoCodec)) {
			cmd.push("-preset", encoderPreset);
		} else if (isVideotoolboxCodec(videoCodec)) {
			cmd.push("-realtime", "1");
		}

		if (config.audioInputArgs.length || config.mapSourceAudio) {
			cmd.push("-c:a", config.audioCodec, "-b:a", config.audioBitrate);
			if (config.audioCodec === "aac") {
				cmd.push("-ac", "2", "-ar", "48000");
			}
		}

		cmd.push("-f", "hls");
		cmd.push("-hls_time", config.hlsTime, "-hls_list_size", String(config.hlsListSize));
		cmd.push("-hls_flags", "delete_segments+independent_segments+temp_file");
		cmd.push("-hls_segment_type", "fmp4", "-hls_fmp4_init_filename", "init.mp4");
		cmd.push("-master_pl_name", "master.m3u8");
		cmd.push("-hls_segment_filename", "segment-%06d.m4s");
		cmd.push("video.m3u8");

		return cmd;
	}

	spawnFfmpeg(config) {
		const [command, ...args] = this.buildFfmpegCommand(config);
		this.log(`Running: ${[command, ...args].join(" ")}`);
		const child = spawn(command, args, {
			cwd: config.remoteDir,
			stdio: ["ignore", "pipe", "pipe"],
			windowsHide: true,
		});

		const handleData = (data) => {
			this.logBuffer += data.toString();
			const lines = this.logBuffer.split(/\r?\n/);
			this.logBuffer = lines.pop() || "";
			for (const line of lines) {
				const trimmed = line.trim();
				if (trimmed) this.log(`ffmpeg: ${trimmed}`);
			}
		};

		child.stdout?.on("data", handleData);
		child.stderr?.on("data", handleData);
		child.once("error", (err) => {
			this.log(`FFmpeg failed to start: ${err.message}`);
			if (this.ffmpegProcess === child && !this.stopping) {
				void this.stop({ error: err.message });
			}
		});
		child.once("exit", (code, signal) => {
			if (this.logBuffer.trim()) {
				this.log(`ffmpeg: ${this.logBuffer.trim()}`);
				this.logBuffer = "";
			}
			this.log(`FFmpeg exited with code=${code ?? "null"} signal=${signal ?? "none"}`);
			if (this.ffmpegProcess === child) {
				this.ffmpegProcess = null;
			}
			if (!this.stopping && this.status !== "idle") {
				void this.stop({ error: `FFmpeg exited with code ${code ?? signal ?? "unknown"}.` });
			}
		});

		return child;
	}

	async ensureFallbackMasterPlaylist() {
		const config = this.activeConfig;
		if (!config) return;

		const masterPath = join(config.remoteDir, "master.m3u8");
		const mediaPath = join(config.remoteDir, "video.m3u8");

		try {
			await stat(masterPath);
			return;
		} catch (_err) {
			// Continue if master.m3u8 does not exist yet.
		}

		try {
			await stat(mediaPath);
		} catch (_err) {
			return;
		}

		const bandwidth = parseBitrateToBps(config.videoBitrate) + parseBitrateToBps(config.audioBitrate);
		const resolution = config.outputWidth && config.outputHeight ? `,RESOLUTION=${config.outputWidth}x${config.outputHeight}` : "";
		const includeAudio = config.audioInputArgs.length || config.mapSourceAudio;
		const codecs = codecString(config.videoCodec, config.audioCodec, includeAudio);
		const codecsPart = codecs ? `,CODECS="${codecs}"` : "";
		const body = ["#EXTM3U", "#EXT-X-VERSION:7", `#EXT-X-STREAM-INF:BANDWIDTH=${bandwidth}${codecsPart}${resolution}`, "video.m3u8", ""].join("\n");

		await writeFile(masterPath, body, "utf8");
		this.log("Generated fallback master.m3u8");
	}

	async candidateFiles() {
		const config = this.activeConfig;
		if (!config) return [];

		let entries = [];
		try {
			entries = await readdir(config.remoteDir, { withFileTypes: true });
		} catch (_err) {
			return [];
		}

		const priority = (filename) => {
			if (filename === "master.m3u8") return 2;
			if (filename === "video.m3u8") return 1;
			return 0;
		};

		return entries
			.filter((entry) => entry.isFile())
			.map((entry) => join(config.remoteDir, entry.name))
			.filter((filePath) => {
				const filename = filePath.split(/[\\/]/).pop();
				return filename === "master.m3u8" || filename === "video.m3u8" || SEGMENT_EXTENSIONS.has(extensionForName(filename));
			})
			.sort((left, right) => {
				const leftName = left.split(/[\\/]/).pop();
				const rightName = right.split(/[\\/]/).pop();
				return priority(leftName) - priority(rightName) || leftName.localeCompare(rightName);
			});
	}

	async fileSignature(filePath) {
		const stats = await stat(filePath);
		if (!stats.isFile() || stats.size <= 0) return null;
		return `${stats.size}:${stats.mtimeMs}`;
	}

	mimeTypeForPath(filePath) {
		const filename = filePath.split(/[\\/]/).pop();
		const extension = extensionForName(filename);
		if (filename === "master.m3u8" || filename === "video.m3u8" || extension === ".m3u8") return "application/vnd.apple.mpegurl";
		if (extension === ".m4s") return "video/iso.segment";
		if (extension === ".mp4") return "video/mp4";
		if (extension === ".ts") return "video/mp2t";
		if (extension === ".aac") return "audio/aac";
		return "application/octet-stream";
	}

	remoteUrlForPath(filePath) {
		const config = this.activeConfig;
		const sessionInfo = this.sessionInfo;
		const filename = relative(config.remoteDir, filePath).split(/[\\/]/).pop();
		const base = `${config.websiteBaseUrl}/live/api/${sessionInfo.sessionId}`;

		if (filename === "master.m3u8") return `${base}/master.m3u8`;
		if (filename === "video.m3u8") return `${base}/video.m3u8`;
		return `${base}/segments/${encodeURIComponent(filename)}`;
	}

	async uploadFile(filePath) {
		const signature = await this.fileSignature(filePath);
		if (!signature || this.lastUploaded.get(filePath) === signature) return;

		const url = this.remoteUrlForPath(filePath);
		const contentType = this.mimeTypeForPath(filePath);
		const isPlaylist = extensionForName(filePath) === ".m3u8";
		const body = isPlaylist ? await readFile(filePath, "utf8") : await readFile(filePath);
		const response = await fetch(url, {
			method: "PUT",
			headers: {
				"Content-Type": contentType,
				"X-Live-Ingest-Secret": this.sessionInfo.ingestSecret,
			},
			body,
		});

		await raiseForStatus(response);
		this.lastUploaded.set(filePath, signature);
		this.log(`Uploaded: ${filePath.split(/[\\/]/).pop()}`);
	}

	async sendHeartbeat() {
		const config = this.activeConfig;
		const sessionInfo = this.sessionInfo;
		if (!config || !sessionInfo) return;

		const response = await fetch(`${config.websiteBaseUrl}/live/api/${sessionInfo.sessionId}/heartbeat`, {
			method: "POST",
			headers: {
				"X-Live-Ingest-Secret": sessionInfo.ingestSecret,
			},
		});
		await raiseForStatus(response);
		this.lastHeartbeatAt = Date.now();
	}

	async uploadPass() {
		if (!this.activeConfig || !this.sessionInfo || this.uploadInFlight) return;

		this.uploadInFlight = true;
		try {
			await this.ensureFallbackMasterPlaylist();
			const files = await this.candidateFiles();
			for (const filePath of files) {
				await this.uploadFile(filePath);
			}

			const heartbeatEvery = Math.max(5000, this.sessionInfo.heartbeatIntervalMs || 15000);
			if (Date.now() - this.lastHeartbeatAt >= heartbeatEvery) {
				await this.sendHeartbeat();
			}
		} catch (err) {
			this.log(`Uploader error: ${err.message}`);
		} finally {
			this.uploadInFlight = false;
		}
	}

	startUploader() {
		this.lastHeartbeatAt = 0;
		this.uploadTimer = setInterval(() => {
			void this.uploadPass();
		}, UPLOAD_POLL_INTERVAL_MS);
		void this.uploadPass();
	}

	async endSession() {
		const config = this.activeConfig;
		const sessionInfo = this.sessionInfo;
		if (!config || !sessionInfo) return;

		try {
			const response = await fetch(`${config.websiteBaseUrl}/live/api/${sessionInfo.sessionId}/end`, {
				method: "POST",
				headers: {
					"X-Live-Ingest-Secret": sessionInfo.ingestSecret,
				},
			});
			if (![200, 204, 404, 410].includes(response.status)) {
				await raiseForStatus(response);
			}
		} catch (err) {
			this.log(`Session end request failed: ${err.message}`);
		}
	}

	async start(rawConfig = {}) {
		if (this.status !== "idle" && this.status !== "error") {
			throw new Error("A desktop stream is already active.");
		}

		const config = this.normalizeConfig(rawConfig);
		this.stopping = false;
		this.error = "";
		this.setState("starting");

		try {
			await mkdir(config.remoteDir, { recursive: true });
			this.activeConfig = config;
			this.lastUploaded = new Map();

			this.log("Creating live session...");
			this.sessionInfo = await this.createSession(config);
			this.log(`Session created: ${this.sessionInfo.sessionId}`);
			this.log(`Playback URL: ${this.sessionInfo.playbackUrl}`);
			this.log(`Share page: ${this.sessionInfo.shareUrl}`);
			this.sendToRenderer("live-stream-session", this.sessionInfo);

			this.startUploader();
			this.ffmpegProcess = this.spawnFfmpeg(config);
			this.setState("streaming");
			this.log("Streaming started");

			if (config.openSharePage && this.sessionInfo.shareUrl) {
				void this.shell.openExternal(this.sessionInfo.shareUrl);
			}

			return this.getState();
		} catch (err) {
			await this.stop({ error: err.message });
			throw err;
		}
	}

	async terminateFfmpeg() {
		const processToStop = this.ffmpegProcess;
		if (!processToStop || processToStop.killed) return;

		await new Promise((resolve) => {
			const timeout = setTimeout(() => {
				try {
					processToStop.kill("SIGKILL");
				} catch (_err) {
					// Process already exited.
				}
				resolve();
			}, 5000);

			processToStop.once("exit", () => {
				clearTimeout(timeout);
				resolve();
			});

			try {
				processToStop.kill("SIGTERM");
			} catch (_err) {
				clearTimeout(timeout);
				resolve();
			}
		});
	}

	async stop({ error = "" } = {}) {
		if (this.status === "idle" && !this.activeConfig && !this.ffmpegProcess) {
			return this.getState();
		}

		this.stopping = true;
		this.setState("stopping", { error });
		this.log("Stopping stream...");

		if (this.uploadTimer) {
			clearInterval(this.uploadTimer);
			this.uploadTimer = null;
		}

		await this.terminateFfmpeg();
		this.ffmpegProcess = null;

		await this.uploadPass();
		await this.endSession();

		const remoteDir = this.activeConfig?.remoteDir;
		if (remoteDir) {
			await rm(remoteDir, { recursive: true, force: true }).catch(() => {});
		}

		this.activeConfig = null;
		this.sessionInfo = null;
		this.lastUploaded = new Map();
		this.logBuffer = "";
		this.stopping = false;
		this.setState(error ? "error" : "idle", { error });
		if (!error) this.log("Stopped");

		return this.getState();
	}
}

const hashSource = (source) => createHash("sha1").update(`${source.id}:${source.name}`).digest("hex");

const registerLiveStreamIpc = ({ ipcMain, app, desktopCapturer, shell, sendToRenderer, logger }) => {
	const manager = new ElectronLiveStreamManager({
		app,
		desktopCapturer,
		shell,
		sendToRenderer,
		logger,
	});

	ipcMain.handle("live-stream:get-sources", async (_event, options) => {
		const sources = await manager.getDesktopSources(options);
		return sources.map((source) => ({
			...source,
			key: hashSource(source),
		}));
	});

	ipcMain.handle("live-stream:get-state", () => manager.getState());
	ipcMain.handle("live-stream:start", (_event, config) => manager.start(config));
	ipcMain.handle("live-stream:stop", () => manager.stop());
	ipcMain.handle("live-stream:open-url", (_event, url) => {
		if (!url) return false;
		void shell.openExternal(url);
		return true;
	});

	app.on("before-quit", () => {
		void manager.stop();
	});

	return manager;
};

export { DEFAULT_SETTINGS, ENCODER_PRESETS, registerLiveStreamIpc };
