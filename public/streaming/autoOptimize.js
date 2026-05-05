import { buildDefaultSettings } from "./defaults.js";

const pickAutoCodec = (capabilities) => {
	if (capabilities?.encoders?.nvenc?.h264) return "h264_nvenc";
	if (capabilities?.encoders?.qsv?.h264) return "h264_qsv";
	if (capabilities?.os === "darwin" && capabilities?.encoders?.videotoolbox?.h264) return "h264_videotoolbox";
	return "libopenh264";
};

const pickAutoPreset = (videoCodec) => {
	if (videoCodec.includes("_nvenc")) return "p4";
	if (videoCodec.includes("_qsv")) return "veryfast";
	if (videoCodec.includes("_videotoolbox")) return "realtime";
	return "default";
};

const pickBitrate = (width, height, fps) => {
	if (width >= 1920 && height >= 1080 && fps >= 60) return "8M";
	if (width >= 1920 && height >= 1080) return "6M";
	if (width >= 1280 && height >= 720 && fps >= 60) return "5M";
	return "3M";
};

const autoOptimize = (capabilities, fallbackSettings = buildDefaultSettings()) => {
	const primaryDisplay = capabilities?.displays?.[0] || null;
	const width = Math.min(primaryDisplay?.size?.width || fallbackSettings.outputWidth || 1920, 1920);
	const height = Math.min(primaryDisplay?.size?.height || fallbackSettings.outputHeight || 1080, 1080);
	const fps = Math.min(Math.round(primaryDisplay?.displayFrequency || fallbackSettings.fps || 60), 60);
	const videoCodec = pickAutoCodec(capabilities);
	const encoderPreset = pickAutoPreset(videoCodec);

	const captureBackend =
		capabilities?.os === "win32" && capabilities?.captureBackends?.includes("gfxcapture")
			? "gfxcapture"
			: capabilities?.os === "win32"
				? "gdigrab"
				: fallbackSettings.captureBackend;

	return {
		...fallbackSettings,
		videoCodec,
		encoderPreset,
		captureBackend,
		outputWidth: width,
		outputHeight: height,
		fps,
		gopSize: fps * Number.parseFloat(fallbackSettings.hlsTime || "2"),
		videoBitrate: pickBitrate(width, height, fps),
		vbvMultiplier: 1.0,
	};
};

export { autoOptimize };
