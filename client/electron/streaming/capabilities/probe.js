import { spawnSync } from "child_process";
import { mkdir, readFile, rename, writeFile } from "fs/promises";
import os from "os";
import { dirname, join } from "path";

const readCommandOutput = (command, args) => {
	const result = spawnSync(command, args, {
		encoding: "utf8",
		windowsHide: true,
	});
	if (result.error) return "";
	return `${result.stdout || ""}\n${result.stderr || ""}`;
};

const parseHwaccels = (output) =>
	output
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter(Boolean)
		.filter((line) => !line.startsWith("--"))
		.filter((line) => !line.startsWith("Hardware acceleration methods:"))
		.map((line) => line.split(/\s+/)[0])
		.filter(Boolean);

const parseEncoderOrFilterList = (output, heading) =>
	output
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter(Boolean)
		.filter((line) => !line.startsWith("--"))
		.filter((line) => !line.startsWith(heading))
		.map((line) => line.split(/\s+/))
		.filter((tokens) => tokens.length >= 2)
		.filter((tokens) => tokens[1] !== "=")
		.map((tokens) => tokens[1])
		.filter(Boolean);

const parseMuxers = (output) => parseEncoderOrFilterList(output, "Muxers:");

const parseWhipMuxerHelp = (output) => {
	const normalized = output.toLowerCase();
	return {
		available: /\bmuxer\s+whip\b/.test(normalized) || /\bwhip\s+muxer\b/.test(normalized),
		authorizationOption: /\bauthorization\b/.test(normalized),
		experimental: /\bexperimental\b/.test(normalized),
	};
};

const parseEncoderAvailability = (encoders) => {
	const set = new Set(encoders);
	return {
		nvenc: {
			h264: set.has("h264_nvenc"),
			hevc: set.has("hevc_nvenc"),
			av1: set.has("av1_nvenc"),
		},
		qsv: {
			h264: set.has("h264_qsv"),
			hevc: set.has("hevc_qsv"),
			av1: set.has("av1_qsv"),
		},
		amf: {
			h264: set.has("h264_amf"),
			hevc: set.has("hevc_amf"),
			av1: set.has("av1_amf"),
		},
		videotoolbox: {
			h264: set.has("h264_videotoolbox"),
			hevc: set.has("hevc_videotoolbox"),
			av1: false,
		},
		audio: {
			aac: set.has("aac"),
			opus: set.has("opus") || set.has("libopus"),
		},
	};
};

const detectWindowsGpu = () => {
	if (process.platform !== "win32") return { vendor: "", model: "", driver: "" };
	const output = readCommandOutput("powershell", [
		"-NoProfile",
		"-Command",
		"Get-CimInstance Win32_VideoController | Select-Object Name,AdapterCompatibility,DriverVersion | ConvertTo-Json -Compress",
	]);
	if (!output) return { vendor: "", model: "", driver: "" };
	try {
		const parsed = JSON.parse(output.trim());
		const first = Array.isArray(parsed) ? parsed[0] : parsed;
		return {
			vendor: String(first?.AdapterCompatibility || ""),
			model: String(first?.Name || ""),
			driver: String(first?.DriverVersion || ""),
		};
	} catch (_err) {
		return { vendor: "", model: "", driver: "" };
	}
};

const detectCaptureBackends = (platform, filterNames) => {
	if (platform === "win32") {
		const backends = ["gdigrab"];
		if (filterNames.includes("gfxcapture")) backends.unshift("gfxcapture");
		return backends;
	}
	if (platform === "darwin") return ["avfoundation"];
	return ["x11grab"];
};

const createCapabilitySnapshot = ({ ffmpegPath, getDisplays = () => [] }) => {
	const hwaccels = parseHwaccels(readCommandOutput(ffmpegPath, ["-hide_banner", "-hwaccels"]));
	const encoders = parseEncoderOrFilterList(readCommandOutput(ffmpegPath, ["-hide_banner", "-encoders"]), "Encoders:");
	const filters = parseEncoderOrFilterList(readCommandOutput(ffmpegPath, ["-hide_banner", "-filters"]), "Filters:");
	const muxers = parseMuxers(readCommandOutput(ffmpegPath, ["-hide_banner", "-muxers"]));
	const whipMuxerHelp = parseWhipMuxerHelp(readCommandOutput(ffmpegPath, ["-hide_banner", "-h", "muxer=whip"]));
	const displays = getDisplays();
	const gpu = detectWindowsGpu();
	return {
		os: process.platform,
		arch: process.arch,
		cpuCount: os.cpus()?.length || 0,
		totalMemory: os.totalmem(),
		gpu,
		encoders: parseEncoderAvailability(encoders),
		hwaccels,
		filters,
		muxers,
		webrtc: {
			whipMuxer: muxers.includes("whip"),
			whipMuxerHelp: whipMuxerHelp.available,
			whipAuthorizationOption: whipMuxerHelp.authorizationOption,
			whipExperimental: whipMuxerHelp.experimental,
		},
		captureBackends: detectCaptureBackends(process.platform, filters),
		audioDevices: [],
		displays,
		probedAt: Date.now(),
	};
};

const readJsonSafe = async (path) => {
	try {
		const raw = await readFile(path, "utf8");
		return JSON.parse(raw);
	} catch (_err) {
		return null;
	}
};

const writeJsonAtomic = async (path, value) => {
	const tmpPath = `${path}.tmp`;
	await mkdir(dirname(path), { recursive: true });
	await writeFile(tmpPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
	await rename(tmpPath, path);
};

const createCapabilityStore = ({ app, ffmpegPath, getDisplays }) => {
	const capabilitiesPath = join(app.getPath("userData"), "capabilities.json");

	const readCached = async () => readJsonSafe(capabilitiesPath);

	const reprobe = async () => {
		const capabilities = createCapabilitySnapshot({
			ffmpegPath,
			getDisplays,
		});
		await writeJsonAtomic(capabilitiesPath, capabilities);
		return capabilities;
	};

	const get = async () => {
		const cached = await readCached();
		if (cached) return cached;
		return reprobe();
	};

	return {
		get,
		reprobe,
		path: capabilitiesPath,
	};
};

export { createCapabilityStore, parseMuxers, parseWhipMuxerHelp };
