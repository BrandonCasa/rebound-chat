/**
 * Canonical config fixtures used across pipeline tests.
 *
 * Each fixture mirrors a normalized StreamConfig (the shape produced by
 * ElectronLiveStreamManager.normalizeConfig). Keep these dense and
 * deduplicated via the `withDefaults` helper so each test only declares
 * what it differs on.
 */

const baseDefaults = {
	ffmpegPath: "ffmpeg.exe",
	source: { id: "screen:0", name: "Display 1" },
	captureBackend: "gfxcapture",
	captureFps: 60,
	rtbufsize: "256M",
	manualInputArgs: [],
	audioInputArgs: [],
	mapSourceAudio: false,
	drawMouse: true,
	videoCodec: "h264_nvenc",
	audioCodec: "aac",
	outputWidth: 1920,
	outputHeight: 1080,
	videoBitrate: "8M",
	audioBitrate: "160k",
	fps: 60,
	encoderPreset: "p4",
	nvencTune: "ull",
	nvencMultipass: "disabled",
	nvencRc: "vbr",
	nvencCq: 23,
	nvencSpatialAq: true,
	nvencTemporalAq: false,
	nvencBRefMode: "disabled",
	nvencBFrames: 0,
	nvencLookahead: 0,
	gopSize: 120,
	vbvMultiplier: 1.0,
	hlsTime: "2",
	hlsListSize: 6,
	hdrMode: "off",
};

const withDefaults = (overrides = {}) => ({ ...baseDefaults, ...overrides });

const windowsRtxNvenc1080p60 = () => withDefaults();

const windowsRtxNvencDifferentFps = () =>
	withDefaults({
		captureFps: 60,
		fps: 30,
	});

const windowsRtxNvenc1440pHdrConvert = () =>
	withDefaults({
		outputWidth: 2560,
		outputHeight: 1440,
		captureFps: 60,
		fps: 60,
		hdrMode: "convert",
	});

const windowsRtxNvenc1440pHdrPassthrough = () =>
	withDefaults({
		videoCodec: "hevc_nvenc",
		outputWidth: 2560,
		outputHeight: 1440,
		captureFps: 60,
		fps: 60,
		hdrMode: "passthrough",
	});

const windowsGdigrabSoftware = () =>
	withDefaults({
		captureBackend: "gdigrab",
		videoCodec: "libx264",
		encoderPreset: "veryfast",
	});

const windowsGfxcaptureSoftware = () =>
	withDefaults({
		videoCodec: "libx264",
		encoderPreset: "veryfast",
	});

const windowsManualInputArgs = () =>
	withDefaults({
		manualInputArgs: ["-f", "lavfi", "-i", "testsrc=size=1920x1080:rate=60"],
		source: null,
	});

const windowsFileSource = () =>
	withDefaults({
		sourceMode: "file",
		captureBackend: "file",
		filePath: "C:/videos/demo.mp4",
		fileLoop: true,
		source: null,
	});

const windowsNvencHevcWithAudio = () =>
	withDefaults({
		videoCodec: "hevc_nvenc",
		audioInputArgs: ["-f", "dshow", "-i", "audio=Microphone"],
	});

const windowsNvencNoResize = () =>
	withDefaults({
		outputWidth: null,
		outputHeight: null,
	});

const macAppleSilicon = () =>
	withDefaults({
		captureBackend: "gdigrab",
		videoCodec: "h264_videotoolbox",
		encoderPreset: "realtime",
		drawMouse: true,
		captureFps: 60,
		fps: 60,
	});

const linuxX11Software = () =>
	withDefaults({
		captureBackend: "gdigrab",
		videoCodec: "libx264",
		encoderPreset: "fast",
		captureFps: 30,
		fps: 30,
	});

const windowsQsv = () =>
	withDefaults({
		captureBackend: "gdigrab",
		videoCodec: "h264_qsv",
		encoderPreset: "medium",
	});

const linuxVaapi = () =>
	withDefaults({
		captureBackend: "x11grab",
		videoCodec: "h264_vaapi",
		encoderPreset: "medium",
		captureFps: 30,
		fps: 30,
	});

export {
	withDefaults,
	windowsRtxNvenc1080p60,
	windowsRtxNvencDifferentFps,
	windowsRtxNvenc1440pHdrConvert,
	windowsRtxNvenc1440pHdrPassthrough,
	windowsGdigrabSoftware,
	windowsGfxcaptureSoftware,
	windowsManualInputArgs,
	windowsFileSource,
	windowsNvencHevcWithAudio,
	windowsNvencNoResize,
	macAppleSilicon,
	linuxX11Software,
	linuxVaapi,
	windowsQsv,
};
