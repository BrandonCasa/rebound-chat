#!/usr/bin/env node

import { existsSync } from "fs";
import { resolve } from "path";
import { fileURLToPath } from "url";

import { createCapabilityStore } from "../streaming/capabilities/probe.js";

const electronRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const workspaceRoot = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const binName = process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
const bundledFfmpeg = resolve(electronRoot, "native", "ffmpeg", "bin", binName);
const ffmpegPath = process.argv[2] || process.env.FFMPEG_PATH || (existsSync(bundledFfmpeg) ? bundledFfmpeg : binName);

const app = {
	getPath(name) {
		if (name !== "userData") {
			throw new Error(`Unsupported app path requested by probe: ${name}`);
		}
		return resolve(workspaceRoot, ".codex", "ffmpeg-capabilities");
	},
};

const store = createCapabilityStore({
	app,
	ffmpegPath,
	getDisplays: () => [],
});

try {
	const snapshot = await store.reprobe();
	const result = {
		ffmpegPath,
		os: snapshot.os,
		arch: snapshot.arch,
		webrtc: snapshot.webrtc,
		codecs: {
			h264: {
				nvenc: snapshot.encoders.nvenc.h264,
				qsv: snapshot.encoders.qsv.h264,
				amf: snapshot.encoders.amf.h264,
				videotoolbox: snapshot.encoders.videotoolbox.h264,
			},
			opus: snapshot.encoders.audio.opus,
		},
		capabilitiesPath: store.path,
	};
	console.log(JSON.stringify(result, null, 2));
	if (!snapshot.webrtc.whipMuxer || !snapshot.webrtc.whipMuxerHelp) {
		process.exitCode = 2;
	}
} catch (err) {
	console.error(`[ffmpeg-webrtc] failed: ${err?.stack || err?.message || err}`);
	process.exit(1);
}
