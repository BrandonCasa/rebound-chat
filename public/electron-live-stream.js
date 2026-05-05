import { spawn } from "child_process";
import { mkdir, rm, stat, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

import { codecFamily, codecString, lower, parseBitrateToBps } from "./streaming/codecs.js";
import {
	ENCODER_PRESETS,
	NVENC_B_REF_MODE_OPTIONS,
	NVENC_MULTIPASS_OPTIONS,
	NVENC_RC_OPTIONS,
	NVENC_TUNE_OPTIONS,
	normalizeChoice,
	normalizeEncoderPreset,
} from "./streaming/presets.js";
import { parseOptionalPositiveInt, parsePositiveFloat, parsePositiveInt } from "./streaming/numbers.js";
import { splitCommandLine } from "./streaming/strings.js";
import { normalizeAudioCodec } from "./streaming/audio.js";
import { DEFAULT_SETTINGS } from "./streaming/defaults.js";
import { availableEncoderPresets, currentPlatformProfile, defaultEncoderPresets } from "./streaming/platform/index.js";
import { buildArgs as buildPipelineArgs, defaultCapabilities } from "./streaming/pipeline.js";
import { uploadAgent } from "./streaming/uploader/httpClient.js";
import { createUploader } from "./streaming/uploader/index.js";

const UPLOAD_POLL_INTERVAL_MS = 750;

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

class ElectronLiveStreamManager {
	constructor({ app, shell, sendToRenderer, logger }) {
		this.app = app;
		this.shell = shell;
		this.sendToRenderer = sendToRenderer;
		this.logger = logger;
		this.status = "idle";
		this.error = "";
		this.activeConfig = null;
		this.sessionInfo = null;
		this.ffmpegProcess = null;
		this.uploader = null;
		this.stopping = false;
		this.logBuffer = "";
		this.capabilities = defaultCapabilities();
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

	/**
	 * Catalog of what this host's bundled FFmpeg can do. Used by the renderer
	 * to populate dropdowns honestly. Reads through the platform profile, so
	 * tweaks land here automatically when the profile changes.
	 */
	getCapabilities() {
		const profile = currentPlatformProfile();
		return {
			profileId: profile.id,
			profileDescription: profile.description,
			platform: process.platform,
			arch: process.arch,
			videoCodecs: [...profile.videoCodecs],
			audioCodecs: [...profile.audioCodecs],
			captureBackends: [...profile.captureBackends],
			defaults: { ...profile.defaults },
			encoderPresets: availableEncoderPresets(profile),
			defaultEncoderPresets: defaultEncoderPresets(profile),
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

	normalizeConfig(rawConfig = {}) {
		const config = {
			...DEFAULT_SETTINGS,
			...rawConfig,
		};

		const profile = currentPlatformProfile();

		const videoCodec = lower(config.videoCodec);
		codecFamily(videoCodec);
		if (!profile.videoCodecs.includes(videoCodec)) {
			throw new Error(`Video codec "${videoCodec}" is not available in this build (${profile.id}). Available: ${profile.videoCodecs.join(", ")}.`);
		}
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
			captureBackend: normalizeChoice(config.captureBackend, profile.captureBackends, profile.defaults.captureBackend, "Capture backend"),
			captureFps,
			rtbufsize: String(config.rtbufsize ?? DEFAULT_SETTINGS.rtbufsize ?? "").trim(),
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

	buildFfmpegCommand(config, capabilities = this.capabilities) {
		const { command, args } = buildPipelineArgs(config, capabilities);
		return { command, args, full: [command, ...args] };
	}

	spawnFfmpeg(config) {
		const { command, args } = this.buildFfmpegCommand(config);
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
				void this.handleFfmpegExit({ child, code: null, signal: null, error: err.message });
			}
		});
		child.once("exit", (code, signal) => {
			if (this.logBuffer.trim()) {
				this.log(`ffmpeg: ${this.logBuffer.trim()}`);
				this.logBuffer = "";
			}
			this.log(`FFmpeg exited with code=${code ?? "null"} signal=${signal ?? "none"}`);
			void this.handleFfmpegExit({ child, code, signal, error: null });
		});

		return child;
	}

	async handleFfmpegExit({ child, code, signal, error }) {
		if (this.ffmpegProcess === child) {
			this.ffmpegProcess = null;
		}

		if (this.stopping || this.status === "idle") return;

		const reason = error || `FFmpeg exited with code ${code ?? signal ?? "unknown"}.`;
		void this.stop({ error: reason });
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
		const advertisedFps = config.fps || config.captureFps;
		const frameRatePart = advertisedFps ? `,FRAME-RATE=${Number(advertisedFps).toFixed(3)}` : "";
		const body = ["#EXTM3U", "#EXT-X-VERSION:7", `#EXT-X-STREAM-INF:BANDWIDTH=${bandwidth}${codecsPart}${resolution}${frameRatePart}`, "video.m3u8", ""].join(
			"\n"
		);

		await writeFile(masterPath, body, "utf8");
		this.log("Generated fallback master.m3u8");
	}

	startUploader() {
		const config = this.activeConfig;
		const sessionInfo = this.sessionInfo;
		if (!config || !sessionInfo) return;

		this.uploader = createUploader({
			dir: config.remoteDir,
			websiteBaseUrl: config.websiteBaseUrl,
			sessionInfo,
			pollIntervalMs: UPLOAD_POLL_INTERVAL_MS,
			fetchImpl: fetch,
			raiseForStatus,
			dispatcher: uploadAgent,
			log: (message) => this.log(message),
			ensureFallbackMasterPlaylist: () => this.ensureFallbackMasterPlaylist(),
		});
		this.uploader.start();
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
				...(uploadAgent ? { dispatcher: uploadAgent } : {}),
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
		this.capabilities = defaultCapabilities();
		this.setState("starting");

		try {
			await mkdir(config.remoteDir, { recursive: true });
			this.activeConfig = config;

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

		const uploader = this.uploader;
		this.uploader = null;
		uploader?.stop();

		await this.terminateFfmpeg();
		this.ffmpegProcess = null;

		try {
			await uploader?.flush();
		} catch (err) {
			this.log(`Final upload pass failed: ${err.message}`);
		}
		await this.endSession();

		const remoteDir = this.activeConfig?.remoteDir;
		if (remoteDir) {
			await rm(remoteDir, { recursive: true, force: true }).catch(() => {});
		}

		this.activeConfig = null;
		this.sessionInfo = null;
		this.logBuffer = "";
		this.stopping = false;
		this.setState(error ? "error" : "idle", { error });
		if (!error) this.log("Stopped");

		return this.getState();
	}
}

const registerLiveStreamIpc = ({ ipcMain, app, shell, sendToRenderer, logger }) => {
	const manager = new ElectronLiveStreamManager({
		app,
		shell,
		sendToRenderer,
		logger,
	});

	ipcMain.handle("live-stream:get-state", () => manager.getState());
	ipcMain.handle("live-stream:get-capabilities", () => manager.getCapabilities());
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
