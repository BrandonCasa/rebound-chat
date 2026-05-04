/**
 * Default settings for the live-stream manager. Kept in a pure module so
 * tests can import them without booting Electron.
 *
 * `ffmpegPath`/`ffprobePath` reference globals that only exist inside the
 * renderer process; they are read lazily so this module imports cleanly
 * from any environment.
 */

const ffmpegPathDefault = () => (typeof window !== "undefined" && window.ffmpegPath) || "ffmpeg.exe";
const ffprobePathDefault = () => (typeof window !== "undefined" && window.ffprobePath) || "ffprobe.exe";

const websiteBaseUrlDefault = () => (!process?.env?.NODE_ENV || process?.env?.NODE_ENV === "development" ? "http://localhost:6001" : "https://rebound.nexus");

const buildDefaultSettings = () => ({
	websiteBaseUrl: websiteBaseUrlDefault(),
	liveCreateToken: "",
	authToken: "",
	sessionLabel: "",
	retainSegmentCount: 5,
	ffmpegPath: ffmpegPathDefault(),
	ffprobePath: ffprobePathDefault(),
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
});

const DEFAULT_SETTINGS = buildDefaultSettings();

const CAPTURE_BACKEND_OPTIONS = ["gfxcapture", "gdigrab"];
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

export { DEFAULT_SETTINGS, CAPTURE_BACKEND_OPTIONS, VIDEO_CODEC_OPTIONS, AUDIO_CODEC_OPTIONS, buildDefaultSettings };
