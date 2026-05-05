import DesktopWindowsRounded from "@mui/icons-material/DesktopWindowsRounded";
import ExpandMoreRounded from "@mui/icons-material/ExpandMoreRounded";
import LaunchRounded from "@mui/icons-material/LaunchRounded";
import PlayArrowRounded from "@mui/icons-material/PlayArrowRounded";
import RefreshRounded from "@mui/icons-material/RefreshRounded";
import StopRounded from "@mui/icons-material/StopRounded";
import {
	Accordion,
	AccordionDetails,
	AccordionSummary,
	Alert,
	Box,
	Button,
	Chip,
	CircularProgress,
	Divider,
	FormControl,
	FormControlLabel,
	FormLabel,
	Grid,
	IconButton,
	InputLabel,
	MenuItem,
	Paper,
	Radio,
	RadioGroup,
	Select,
	Stack,
	Switch,
	TextField,
	Tooltip,
	Typography,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";

import { getLiveBase } from "../../helpers/live";
import { setDialogOpened } from "../../slices/dialogSlice";
import { scrollbarStyles } from "../scrollbarStyles";

// Fallback dropdown lists, used when the platform profile catalog is not yet
// loaded over IPC (or when running outside Electron). Once
// `electronLive.getCapabilities()` resolves, the effective lists come from the
// active platform profile in `public/streaming/platform/profiles.js`.
const FALLBACK_VIDEO_CODEC_OPTIONS = [
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
	"hevc_videotoolbox",
	"h264_videotoolbox",
];
const FALLBACK_AUDIO_CODEC_OPTIONS = ["aac"];
const NVENC_PROFILE_OPTIONS = ["quality_live", "balanced_live", "fast_live", "low_latency", "ultra_low_latency", "custom"];
const NVENC_PRESET_LADDER = ["p7", "p6", "p5", "p4", "p3", "p2", "p1"];
const NVENC_TUNE_OPTIONS = ["hq", "ll", "ull", "lossless"];
const NVENC_MULTIPASS_OPTIONS = ["disabled", "qres", "fullres"];
const NVENC_RC_OPTIONS = ["vbr", "cbr", "constqp"];
const NVENC_B_REF_MODE_OPTIONS = ["disabled", "each", "middle"];
const FALLBACK_ENCODER_PRESETS = {
	nvenc: NVENC_PRESET_LADDER,
	software: ["ultrafast", "superfast", "veryfast", "faster", "fast", "medium", "slow", "slower", "veryslow", "placebo"],
	svt_av1: Array.from({ length: 13 }, (_value, index) => String(index)),
	libaom_av1: Array.from({ length: 9 }, (_value, index) => String(index)),
	libvpx_vp9: Array.from({ length: 9 }, (_value, index) => String(index)),
	qsv: ["veryfast", "faster", "fast", "medium", "slow", "slower", "veryslow"],
	videotoolbox: ["realtime"],
};
const FALLBACK_DEFAULT_ENCODER_PRESETS = {
	nvenc: "p6",
	software: "medium",
	svt_av1: "8",
	libaom_av1: "6",
	libvpx_vp9: "5",
	qsv: "medium",
	videotoolbox: "realtime",
};
const NVENC_PROFILE_DEFAULTS = {
	quality_live: {
		encoderPreset: "p6",
		nvencTune: "hq",
		nvencMultipass: "fullres",
		nvencRc: "vbr",
		nvencCq: "23",
		nvencSpatialAq: true,
		nvencTemporalAq: true,
		nvencBRefMode: "middle",
		nvencBFrames: "3",
		nvencLookahead: "16",
	},
	balanced_live: {
		encoderPreset: "p5",
		nvencTune: "hq",
		nvencMultipass: "qres",
		nvencRc: "vbr",
		nvencCq: "25",
		nvencSpatialAq: true,
		nvencTemporalAq: true,
		nvencBRefMode: "middle",
		nvencBFrames: "2",
		nvencLookahead: "8",
	},
	fast_live: {
		encoderPreset: "p1",
		nvencTune: "ll",
		nvencMultipass: "disabled",
		nvencRc: "vbr",
		nvencCq: "30",
		nvencSpatialAq: false,
		nvencTemporalAq: false,
		nvencBRefMode: "disabled",
		nvencBFrames: "0",
		nvencLookahead: "0",
	},
	low_latency: {
		encoderPreset: "p3",
		nvencTune: "ll",
		nvencMultipass: "disabled",
		nvencRc: "cbr",
		nvencCq: "",
		nvencSpatialAq: true,
		nvencTemporalAq: false,
		nvencBRefMode: "disabled",
		nvencBFrames: "0",
		nvencLookahead: "0",
	},
	ultra_low_latency: {
		encoderPreset: "p2",
		nvencTune: "ull",
		nvencMultipass: "disabled",
		nvencRc: "cbr",
		nvencCq: "",
		nvencSpatialAq: false,
		nvencTemporalAq: false,
		nvencBRefMode: "disabled",
		nvencBFrames: "0",
		nvencLookahead: "0",
	},
};

const defaultSettings = {
	websiteBaseUrl: getLiveBase() || window.location.origin,
	liveCreateToken: "",
	sessionLabel: "",
	retainSegmentCount: "5",
	ffmpegPath: window.ffmpegPath || "ffmpeg.exe",
	sourceMode: "screen",
	filePath: "",
	fileLoop: true,
	captureFps: "120",
	rtbufsize: "256M",
	manualInputArgs: "",
	audioInputArgs: "",
	mapSourceAudio: false,
	drawMouse: true,
	videoCodec: "hevc_nvenc",
	audioCodec: "aac",
	outputWidth: "1920",
	outputHeight: "1080",
	videoBitrate: "8M",
	audioBitrate: "160k",
	fps: "120",
	nvencProfile: "fast_live",
	encoderPreset: "p1",
	nvencTune: "ll",
	nvencMultipass: "disabled",
	nvencRc: "vbr",
	nvencCq: "30",
	nvencSpatialAq: false,
	nvencTemporalAq: false,
	nvencBRefMode: "disabled",
	nvencBFrames: "0",
	nvencLookahead: "0",
	gopSize: "60",
	hlsTime: "2",
	hlsListSize: "10",
	convertStreamToSdr: false,
	openSharePage: false,
};

const codecFamily = (codec) => {
	if (["h264_nvenc", "hevc_nvenc", "av1_nvenc"].includes(codec)) return "nvenc";
	if (codec === "libsvtav1") return "svt_av1";
	if (codec === "libaom-av1") return "libaom_av1";
	if (codec === "libvpx-vp9") return "libvpx_vp9";
	if (["libx264", "libx265"].includes(codec)) return "software";
	if (["h264_qsv", "hevc_qsv", "av1_qsv", "vp9_qsv"].includes(codec)) return "qsv";
	if (["h264_videotoolbox", "hevc_videotoolbox"].includes(codec)) return "videotoolbox";
	return "nvenc";
};

const compactDate = (value) => {
	if (!value) return "";
	try {
		return new Intl.DateTimeFormat(undefined, { timeStyle: "medium" }).format(new Date(value));
	} catch (_err) {
		return "";
	}
};

const Field = ({ label, name, settings, setSettings, type = "text", disabled = false, fullWidth = true, multiline = false }) => (
	<TextField
		label={label}
		type={type}
		value={settings[name]}
		disabled={disabled}
		fullWidth={fullWidth}
		size="small"
		multiline={multiline}
		minRows={multiline ? 2 : undefined}
		onChange={(event) => {
			const value = event.target.value;
			const markCustom = name !== "nvencProfile" && (name.startsWith("nvenc") || name === "encoderPreset");
			setSettings((current) => ({
				...current,
				[name]: value,
				...(markCustom ? { nvencProfile: "custom" } : {}),
			}));
		}}
	/>
);

const SelectField = ({ label, name, values, settings, setSettings, disabled = false }) => (
	<FormControl fullWidth size="small" disabled={disabled}>
		<InputLabel>{label}</InputLabel>
		<Select
			label={label}
			value={settings[name]}
			onChange={(event) => {
				const value = event.target.value;
				const markCustom = name !== "nvencProfile" && (name.startsWith("nvenc") || name === "encoderPreset");
				setSettings((current) => ({
					...current,
					[name]: value,
					...(markCustom ? { nvencProfile: "custom" } : {}),
				}));
			}}>
			{values.map((value) => (
				<MenuItem key={value} value={value}>
					{value}
				</MenuItem>
			))}
		</Select>
	</FormControl>
);

const ToggleField = ({ label, name, settings, setSettings, disabled = false }) => (
	<FormControlLabel
		control={
			<Switch
				checked={Boolean(settings[name])}
				disabled={disabled}
				onChange={(event) => {
					const checked = event.target.checked;
					const markCustom = name !== "nvencProfile" && name.startsWith("nvenc");
					setSettings((current) => ({
						...current,
						[name]: checked,
						...(markCustom ? { nvencProfile: "custom" } : {}),
					}));
				}}
			/>
		}
		label={label}
	/>
);

const SettingGrid = ({ children }) => (
	<Grid container spacing={1.5}>
		{React.Children.map(children, (child, index) => (
			<Grid key={index} item xs={12} sm={6} md={4}>
				{child}
			</Grid>
		))}
	</Grid>
);

const SourceTile = ({ source, thumbnail, selected, onSelect }) => {
	const theme = useTheme();
	const subtitle = source.kind === "screen" || source.id?.startsWith("screen:") ? "Screen" : source.appName ? `Window · ${source.appName}` : "Window";

	return (
		<Paper
			role="button"
			tabIndex={0}
			variant="outlined"
			onClick={() => onSelect(source.id)}
			onKeyDown={(event) => {
				if (event.key === "Enter" || event.key === " ") {
					event.preventDefault();
					onSelect(source.id);
				}
			}}
			sx={{
				overflow: "hidden",
				cursor: "pointer",
				outline: "none",
				borderColor: selected ? theme.palette.primary.main : "divider",
				bgcolor: selected ? alpha(theme.palette.primary.main, 0.12) : "background.paper",
			}}>
			<Box
				sx={{
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
					width: "100%",
					aspectRatio: "16 / 9",
					bgcolor: "background.default",
					overflow: "hidden",
				}}>
				{thumbnail ? <Box component="img" src={thumbnail} alt="" sx={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <CircularProgress size={20} />}
			</Box>
			<Stack spacing={0.5} sx={{ p: 1 }}>
				<Typography variant="body2" noWrap>
					{source.name}
				</Typography>
				<Typography variant="caption" color="text.secondary" noWrap>
					{subtitle}
				</Typography>
			</Stack>
		</Paper>
	);
};

function DesktopLivePage() {
	const dispatch = useDispatch();
	const auth = useSelector((state) => state.auth);
	const [settings, setSettings] = useState(defaultSettings);
	const [sources, setSources] = useState([]);
	const [selectedSourceId, setSelectedSourceId] = useState("");
	const [loadingSources, setLoadingSources] = useState(false);
	const [error, setError] = useState("");
	const [logs, setLogs] = useState([]);
	const [streamState, setStreamState] = useState({ status: "idle", sessionInfo: null });
	const [sessionInfo, setSessionInfo] = useState(null);
	const [capabilities, setCapabilities] = useState(null);
	const [detectedCapabilities, setDetectedCapabilities] = useState(null);
	const [thumbnails, setThumbnails] = useState({});
	const [advancedMode, setAdvancedMode] = useState(false);
	const saveSettingsTimeoutRef = useRef(null);
	const hydratedSettingsRef = useRef(false);
	const electronLive = window.electronAPI?.liveStream;
	const electronSources = window.electronAPI?.sources;
	const isElectron = Boolean(electronLive && electronSources);
	const videoCodecOptions = capabilities?.videoCodecs?.length ? capabilities.videoCodecs : FALLBACK_VIDEO_CODEC_OPTIONS;
	const audioCodecOptions = capabilities?.audioCodecs?.length ? capabilities.audioCodecs : FALLBACK_AUDIO_CODEC_OPTIONS;
	const encoderPresetCatalog =
		capabilities?.encoderPresets && Object.keys(capabilities.encoderPresets).length ? capabilities.encoderPresets : FALLBACK_ENCODER_PRESETS;
	const defaultEncoderPresetCatalog =
		capabilities?.defaultEncoderPresets && Object.keys(capabilities.defaultEncoderPresets).length
			? capabilities.defaultEncoderPresets
			: FALLBACK_DEFAULT_ENCODER_PRESETS;
	const family = codecFamily(settings.videoCodec);
	const encoderPresetOptions = encoderPresetCatalog[family] || Object.values(encoderPresetCatalog)[0] || [];
	const isBusy = ["starting", "streaming", "stopping"].includes(streamState.status);
	const selectedSource = useMemo(() => sources.find((source) => source.id === selectedSourceId) || null, [selectedSourceId, sources]);

	const loadSources = useCallback(async () => {
		if (!electronSources) return;
		setLoadingSources(true);
		setError("");
		try {
			// Ask for high-resolution thumbnails up front. desktopCapturer treats
			// this as a max bound, so non-16:9 windows still come back at their
			// native aspect ratio.
			const nextSources = await electronSources.list({
				types: ["screen", "window"],
				thumbnailSize: { width: 1280, height: 720 },
			});
			setSources(nextSources);
			setThumbnails(() => {
				const next = {};
				for (const source of nextSources) {
					if (source?.id && source.thumbnail) next[source.id] = source.thumbnail;
				}
				return next;
			});
			setSelectedSourceId((current) => (current && nextSources.some((source) => source.id === current) ? current : nextSources[0]?.id || ""));
		} catch (err) {
			setError(err.message || "Unable to load desktop sources.");
		} finally {
			setLoadingSources(false);
		}
	}, [electronSources]);

	useEffect(() => {
		if (!electronLive) return undefined;

		let mounted = true;
		electronLive.getState().then((state) => {
			if (mounted) setStreamState(state);
		});

		const offState = electronLive.onState((state) => {
			setStreamState(state);
			setSessionInfo(state.sessionInfo || null);
		});
		const offSession = electronLive.onSession((session) => setSessionInfo(session));
		const offLog = electronLive.onLog((entry) => {
			setLogs((current) => [...current.slice(-250), entry]);
		});

		return () => {
			mounted = false;
			offState?.();
			offSession?.();
			offLog?.();
		};
	}, [electronLive]);

	useEffect(() => {
		loadSources();
	}, [loadSources]);

	useEffect(() => {
		if (!electronLive?.getCapabilities) return undefined;
		let cancelled = false;
		electronLive
			.getCapabilities()
			.then((caps) => {
				if (!cancelled) setCapabilities(caps);
			})
			.catch(() => {
				// Older preload or no capabilities support; the fallback lists keep the UI usable.
			});
		return () => {
			cancelled = true;
		};
	}, [electronLive]);

	useEffect(() => {
		if (!electronLive?.loadSettings) return undefined;
		let cancelled = false;
		electronLive
			.loadSettings()
			.then((saved) => {
				if (!cancelled && saved && typeof saved === "object") {
					setSettings((current) => ({
						...current,
						...saved,
					}));
					hydratedSettingsRef.current = true;
				}
			})
			.catch(() => {
				hydratedSettingsRef.current = true;
			});
		return () => {
			cancelled = true;
		};
	}, [electronLive]);

	useEffect(() => {
		if (!electronLive?.getDetectedCapabilities) return undefined;
		let cancelled = false;
		electronLive
			.getDetectedCapabilities()
			.then((caps) => {
				if (!cancelled) setDetectedCapabilities(caps);
			})
			.catch(() => {});
		return () => {
			cancelled = true;
		};
	}, [electronLive]);

	useEffect(() => {
		if (!electronLive?.saveSettings) return undefined;
		if (!hydratedSettingsRef.current) return undefined;
		if (saveSettingsTimeoutRef.current) {
			clearTimeout(saveSettingsTimeoutRef.current);
		}
		saveSettingsTimeoutRef.current = setTimeout(() => {
			electronLive.saveSettings(settings).catch(() => {});
		}, 1000);
		return () => {
			if (saveSettingsTimeoutRef.current) {
				clearTimeout(saveSettingsTimeoutRef.current);
			}
		};
	}, [electronLive, settings]);

	// Snap settings into bounds whenever the host's capability catalog changes.
	useEffect(() => {
		if (!capabilities) return;
		setSettings((current) => {
			const patch = {};
			if (capabilities.videoCodecs?.length && !capabilities.videoCodecs.includes(current.videoCodec)) {
				patch.videoCodec = capabilities.defaults?.videoCodec || capabilities.videoCodecs[0];
			}
			if (capabilities.audioCodecs?.length && !capabilities.audioCodecs.includes(current.audioCodec)) {
				patch.audioCodec = capabilities.defaults?.audioCodec || capabilities.audioCodecs[0];
			}
			return Object.keys(patch).length ? { ...current, ...patch } : current;
		});
	}, [capabilities]);

	useEffect(() => {
		const profile = NVENC_PROFILE_DEFAULTS[settings.nvencProfile];
		if (!profile) return;
		setSettings((current) => ({ ...current, ...profile }));
	}, [settings.nvencProfile]);

	useEffect(() => {
		const options = encoderPresetCatalog[family] || Object.values(encoderPresetCatalog)[0] || [];
		if (!options.length) return;
		if (!options.includes(settings.encoderPreset)) {
			setSettings((current) => ({ ...current, encoderPreset: defaultEncoderPresetCatalog[family] || options[0] }));
		}
	}, [family, settings.encoderPreset, encoderPresetCatalog, defaultEncoderPresetCatalog]);

	const handleLogin = () => {
		dispatch(
			setDialogOpened({
				dialogName: "loginDialogOpen",
				newState: true,
				conflictingDialogs: ["registerDialogOpen"],
			})
		);
	};

	const handleStart = async () => {
		if (!electronLive) return;
		setError("");
		setLogs([]);
		try {
			const state = await electronLive.start({
				...settings,
				source: settings.sourceMode === "file" ? null : selectedSource,
				authToken: auth.authToken || "",
			});
			setStreamState(state);
		} catch (err) {
			setError(err.message || "Unable to start stream.");
		}
	};

	const handleResetSettings = async () => {
		if (!electronLive?.resetSettings) return;
		try {
			const next = await electronLive.resetSettings();
			setSettings((current) => ({ ...current, ...next }));
		} catch (_err) {
			// Keep current settings if reset fails.
		}
	};

	const handleReprobe = async () => {
		if (!electronLive?.reprobeCapabilities) return;
		try {
			const next = await electronLive.reprobeCapabilities();
			setDetectedCapabilities(next);
		} catch (_err) {
			// Keep current capabilities if reprobe fails.
		}
	};

	const handleStop = async () => {
		if (!electronLive) return;
		setError("");
		try {
			const state = await electronLive.stop();
			setStreamState(state);
		} catch (err) {
			setError(err.message || "Unable to stop stream.");
		}
	};

	if (!isElectron) {
		return (
			<Box sx={{ width: "100%" }}>
				<Alert severity="info">Desktop streaming is only available in the Electron app.</Alert>
			</Box>
		);
	}

	return (
		<Box sx={{ width: "100%", height: "100%", overflow: "hidden" }}>
			<Stack spacing={2} sx={{ height: "100%", minWidth: 0 }}>
				<Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} alignItems={{ xs: "flex-start", sm: "center" }} justifyContent="space-between">
					<Stack direction="row" spacing={1.25} alignItems="center" sx={{ minWidth: 0 }}>
						<DesktopWindowsRounded color="primary" sx={{ fontSize: 34 }} />
						<Stack spacing={0.25} sx={{ minWidth: 0 }}>
							<Typography variant="h5">Desktop Stream</Typography>
							<Typography variant="body2" color="text.secondary">
								{streamState.status === "streaming" ? `Streaming ${selectedSource?.name || ""}` : "Capture a desktop source through FFmpeg"}
							</Typography>
						</Stack>
					</Stack>
					<Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap">
						<Chip
							size="small"
							color={streamState.status === "streaming" ? "success" : streamState.status === "error" ? "error" : "default"}
							label={streamState.status || "idle"}
						/>
						{detectedCapabilities?.gpu?.model ? <Chip size="small" variant="outlined" label={detectedCapabilities.gpu.model} /> : null}
						{auth.loggedIn ? <Chip size="small" color="primary" label={auth.displayName || auth.username || "Account"} /> : null}
						<Button size="small" variant="text" onClick={handleReprobe} disabled={isBusy}>
							Re-probe
						</Button>
						<Button size="small" variant="text" onClick={handleResetSettings} disabled={isBusy}>
							Reset
						</Button>
						{sessionInfo?.shareUrl ? (
							<Button size="small" variant="outlined" startIcon={<LaunchRounded />} onClick={() => electronLive.openUrl(sessionInfo.shareUrl)}>
								Share
							</Button>
						) : null}
					</Stack>
				</Stack>

				{!auth.loggedIn ? (
					<Alert
						severity="info"
						action={
							<Button color="inherit" size="small" onClick={handleLogin}>
								Log In
							</Button>
						}>
						Logged-in accounts can start one stream without a live create token.
					</Alert>
				) : null}

				{error ? <Alert severity="error">{error}</Alert> : null}

				<Box
					sx={{
						display: "grid",
						gridTemplateColumns: { xs: "1fr", xl: "minmax(0, 1fr) 380px" },
						gap: 2,
						minHeight: 0,
						flexGrow: 1,
						overflow: "hidden",
					}}>
					<Stack spacing={2} sx={{ minHeight: 0, overflowY: "auto", overflowX: "hidden", pr: 0.5, ...scrollbarStyles }}>
						<Paper variant="outlined" sx={{ p: 2 }}>
							<Stack spacing={1.5}>
								<Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
									<Stack spacing={0.25}>
										<Typography variant="h6">Source</Typography>
										<Typography variant="body2" color="text.secondary">
											{settings.sourceMode === "file" ? settings.filePath || "No file selected" : selectedSource ? selectedSource.name : "No source selected"}
										</Typography>
									</Stack>
									{settings.sourceMode === "file" ? null : (
										<Tooltip title="Refresh sources">
											<span>
												<IconButton onClick={loadSources} disabled={loadingSources || isBusy} aria-label="Refresh desktop sources">
													{loadingSources ? <CircularProgress size={20} /> : <RefreshRounded />}
												</IconButton>
											</span>
										</Tooltip>
									)}
								</Stack>
								<FormControl component="fieldset" disabled={isBusy}>
									<FormLabel component="legend">Mode</FormLabel>
									<RadioGroup
										row
										value={settings.sourceMode || "screen"}
										onChange={(event) => {
											const mode = event.target.value;
											setSettings((current) => ({
												...current,
												sourceMode: mode,
												captureBackend: mode === "file" ? "file" : current.captureBackend === "file" ? "gdigrab" : current.captureBackend,
											}));
										}}>
										<FormControlLabel value="screen" control={<Radio />} label="Screen / Window" />
										<FormControlLabel value="file" control={<Radio />} label="Video file" />
									</RadioGroup>
								</FormControl>
								{settings.sourceMode === "file" ? (
									<Stack spacing={1}>
										<TextField
											label="Video file path"
											size="small"
											fullWidth
											value={settings.filePath || ""}
											disabled={isBusy}
											onChange={(event) => {
												const next = event.target.value;
												setSettings((current) => ({
													...current,
													filePath: next,
												}));
											}}
										/>
										<ToggleField label="Loop forever" name="fileLoop" settings={settings} setSettings={setSettings} disabled={isBusy} />
									</Stack>
								) : (
									<Box
										sx={{
											display: "grid",
											gridTemplateColumns: { xs: "1fr", sm: "repeat(2, minmax(0, 1fr))", lg: "repeat(3, minmax(0, 1fr))" },
											gap: 1.5,
										}}>
										{sources.map((source) => (
											<SourceTile
												key={source.id}
												source={source}
												thumbnail={thumbnails[source.id]}
												selected={source.id === selectedSourceId}
												onSelect={setSelectedSourceId}
											/>
										))}
									</Box>
								)}
							</Stack>
						</Paper>

						<Accordion defaultExpanded disableGutters>
							<AccordionSummary expandIcon={<ExpandMoreRounded />}>
								<Typography variant="subtitle1">Session</Typography>
							</AccordionSummary>
							<AccordionDetails>
								<SettingGrid>
									<Field label="Website base URL" name="websiteBaseUrl" settings={settings} setSettings={setSettings} disabled={isBusy} />
									<Field label="Live create token" name="liveCreateToken" settings={settings} setSettings={setSettings} disabled={isBusy} type="password" />
									<Field label="Session label" name="sessionLabel" settings={settings} setSettings={setSettings} disabled={isBusy || auth.loggedIn} />
									<Field label="Retain segments" name="retainSegmentCount" settings={settings} setSettings={setSettings} disabled={isBusy} />
									<Field label="FFmpeg path" name="ffmpegPath" settings={settings} setSettings={setSettings} disabled={isBusy} />
								</SettingGrid>
							</AccordionDetails>
						</Accordion>

						<Accordion defaultExpanded disableGutters>
							<AccordionSummary expandIcon={<ExpandMoreRounded />}>
								<Typography variant="subtitle1">Capture</Typography>
							</AccordionSummary>
							<AccordionDetails>
								<Stack spacing={1.5}>
									<SettingGrid>
										<Field
											label="Capture FPS"
											name="captureFps"
											settings={settings}
											setSettings={setSettings}
											disabled={isBusy || settings.sourceMode === "file"}
										/>
										<Field
											label="Real-time buffer (rtbufsize)"
											name="rtbufsize"
											settings={settings}
											setSettings={setSettings}
											disabled={isBusy || settings.sourceMode === "file"}
										/>
										<ToggleField
											label="Draw mouse cursor"
											name="drawMouse"
											settings={settings}
											setSettings={setSettings}
											disabled={isBusy || settings.sourceMode === "file"}
										/>
										<ToggleField label="Map audio from primary input" name="mapSourceAudio" settings={settings} setSettings={setSettings} disabled={isBusy} />
									</SettingGrid>
									<Field label="Manual FFmpeg input args" name="manualInputArgs" settings={settings} setSettings={setSettings} disabled={isBusy} multiline />
									<Field label="Audio FFmpeg input args" name="audioInputArgs" settings={settings} setSettings={setSettings} disabled={isBusy} multiline />
								</Stack>
							</AccordionDetails>
						</Accordion>

						<Accordion defaultExpanded disableGutters>
							<AccordionSummary expandIcon={<ExpandMoreRounded />}>
								<Typography variant="subtitle1">Output</Typography>
							</AccordionSummary>
							<AccordionDetails>
								<Stack direction="row" justifyContent="flex-end" sx={{ mb: 1 }}>
									<FormControlLabel
										control={<Switch checked={advancedMode} onChange={(event) => setAdvancedMode(event.target.checked)} disabled={isBusy} />}
										label={advancedMode ? "Advanced" : "Auto-optimized"}
									/>
								</Stack>
								<SettingGrid>
									<SelectField
										label="Video codec"
										name="videoCodec"
										values={videoCodecOptions}
										settings={settings}
										setSettings={setSettings}
										disabled={isBusy}
									/>
									<SelectField
										label="Audio codec"
										name="audioCodec"
										values={audioCodecOptions}
										settings={settings}
										setSettings={setSettings}
										disabled={isBusy}
									/>
									<Field label="Width" name="outputWidth" settings={settings} setSettings={setSettings} disabled={isBusy} />
									<Field label="Height" name="outputHeight" settings={settings} setSettings={setSettings} disabled={isBusy} />
									<Field label="Video bitrate" name="videoBitrate" settings={settings} setSettings={setSettings} disabled={isBusy} />
									<Field label="Audio bitrate" name="audioBitrate" settings={settings} setSettings={setSettings} disabled={isBusy} />
									<Field label="Output FPS" name="fps" settings={settings} setSettings={setSettings} disabled={isBusy} />
									<Field label="GOP size" name="gopSize" settings={settings} setSettings={setSettings} disabled={isBusy} />
									<ToggleField label="HDR to SDR" name="convertStreamToSdr" settings={settings} setSettings={setSettings} disabled={isBusy} />
								</SettingGrid>
							</AccordionDetails>
						</Accordion>

						<Accordion disableGutters disabled={!advancedMode}>
							<AccordionSummary expandIcon={<ExpandMoreRounded />}>
								<Typography variant="subtitle1">Encoder</Typography>
							</AccordionSummary>
							<AccordionDetails>
								<SettingGrid>
									<SelectField
										label="NVENC profile"
										name="nvencProfile"
										values={NVENC_PROFILE_OPTIONS}
										settings={settings}
										setSettings={setSettings}
										disabled={isBusy || family !== "nvenc"}
									/>
									<SelectField
										label="Encoder preset"
										name="encoderPreset"
										values={encoderPresetOptions}
										settings={settings}
										setSettings={setSettings}
										disabled={isBusy || family === "videotoolbox"}
									/>
									<SelectField
										label="NVENC tune"
										name="nvencTune"
										values={NVENC_TUNE_OPTIONS}
										settings={settings}
										setSettings={setSettings}
										disabled={isBusy || family !== "nvenc"}
									/>
									<SelectField
										label="NVENC multipass"
										name="nvencMultipass"
										values={NVENC_MULTIPASS_OPTIONS}
										settings={settings}
										setSettings={setSettings}
										disabled={isBusy || family !== "nvenc"}
									/>
									<SelectField
										label="NVENC rate control"
										name="nvencRc"
										values={NVENC_RC_OPTIONS}
										settings={settings}
										setSettings={setSettings}
										disabled={isBusy || family !== "nvenc"}
									/>
									<Field label="NVENC CQ" name="nvencCq" settings={settings} setSettings={setSettings} disabled={isBusy || family !== "nvenc"} />
									<SelectField
										label="NVENC B-ref mode"
										name="nvencBRefMode"
										values={NVENC_B_REF_MODE_OPTIONS}
										settings={settings}
										setSettings={setSettings}
										disabled={isBusy || family !== "nvenc"}
									/>
									<Field label="NVENC B-frames" name="nvencBFrames" settings={settings} setSettings={setSettings} disabled={isBusy || family !== "nvenc"} />
									<Field label="NVENC lookahead" name="nvencLookahead" settings={settings} setSettings={setSettings} disabled={isBusy || family !== "nvenc"} />
									<ToggleField
										label="NVENC spatial AQ"
										name="nvencSpatialAq"
										settings={settings}
										setSettings={setSettings}
										disabled={isBusy || family !== "nvenc"}
									/>
									<ToggleField
										label="NVENC temporal AQ"
										name="nvencTemporalAq"
										settings={settings}
										setSettings={setSettings}
										disabled={isBusy || family !== "nvenc"}
									/>
								</SettingGrid>
							</AccordionDetails>
						</Accordion>

						<Accordion disableGutters>
							<AccordionSummary expandIcon={<ExpandMoreRounded />}>
								<Typography variant="subtitle1">HLS</Typography>
							</AccordionSummary>
							<AccordionDetails>
								<SettingGrid>
									<Field label="Segment seconds" name="hlsTime" settings={settings} setSettings={setSettings} disabled={isBusy} />
									<Field label="Playlist size" name="hlsListSize" settings={settings} setSettings={setSettings} disabled={isBusy} />
									<ToggleField label="Open share page" name="openSharePage" settings={settings} setSettings={setSettings} disabled={isBusy} />
								</SettingGrid>
							</AccordionDetails>
						</Accordion>
					</Stack>

					<Paper
						variant="outlined"
						sx={{
							minHeight: 0,
							overflow: "hidden",
							display: "flex",
							flexDirection: "column",
						}}>
						<Stack spacing={1.5} sx={{ p: 2, borderBottom: (theme) => `1px solid ${theme.palette.divider}` }}>
							<Stack direction="row" spacing={1} alignItems="center">
								<Button
									variant="contained"
									startIcon={streamState.status === "starting" ? <CircularProgress color="inherit" size={18} /> : <PlayArrowRounded />}
									onClick={handleStart}
									disabled={
										isBusy ||
										(settings.sourceMode === "file" ? !settings.filePath && !settings.manualInputArgs : !selectedSource && !settings.manualInputArgs) ||
										(!auth.authToken && !settings.liveCreateToken)
									}>
									Start
								</Button>
								<Button variant="outlined" color="error" startIcon={<StopRounded />} onClick={handleStop} disabled={!isBusy}>
									Stop
								</Button>
							</Stack>
							{sessionInfo ? (
								<Stack spacing={0.75}>
									<Typography variant="body2" color="text.secondary">
										Session {sessionInfo.sessionId}
									</Typography>
									<Typography variant="caption" color="text.secondary" sx={{ wordBreak: "break-all" }}>
										{sessionInfo.playbackUrl}
									</Typography>
								</Stack>
							) : null}
						</Stack>
						<Box sx={{ flexGrow: 1, overflowY: "auto", overflowX: "hidden", p: 1.5, ...scrollbarStyles }}>
							{logs.length ? (
								<Stack spacing={0.75}>
									{logs.map((entry, index) => (
										<Stack key={`${entry.timestamp}-${index}`} direction="row" spacing={1} alignItems="flex-start">
											<Typography variant="caption" color="text.secondary" sx={{ minWidth: 72 }}>
												{compactDate(entry.timestamp)}
											</Typography>
											<Typography variant="caption" component="pre" sx={{ m: 0, whiteSpace: "pre-wrap", wordBreak: "break-word", fontFamily: "monospace" }}>
												{entry.message}
											</Typography>
										</Stack>
									))}
								</Stack>
							) : (
								<Stack spacing={1} alignItems="center" justifyContent="center" sx={{ minHeight: 180 }}>
									<Typography variant="body2" color="text.secondary">
										No stream logs yet.
									</Typography>
								</Stack>
							)}
						</Box>
						<Divider />
						<Stack direction="row" spacing={1} alignItems="center" sx={{ p: 1.5 }}>
							<Chip size="small" label={`${logs.length} logs`} />
							{streamState.startedAt ? <Chip size="small" label={`Started ${compactDate(streamState.startedAt)}`} /> : null}
						</Stack>
					</Paper>
				</Box>
			</Stack>
		</Box>
	);
}

export default DesktopLivePage;
