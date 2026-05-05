import FullscreenRounded from "@mui/icons-material/FullscreenRounded";
import PauseRounded from "@mui/icons-material/PauseRounded";
import PlayArrowRounded from "@mui/icons-material/PlayArrowRounded";
import SyncRounded from "@mui/icons-material/SyncRounded";
import VolumeOffRounded from "@mui/icons-material/VolumeOffRounded";
import VolumeUpRounded from "@mui/icons-material/VolumeUpRounded";
import Hls from "hls.js";
import { Box, Chip, IconButton, LinearProgress, Slider, Stack, Tooltip, Typography, useMediaQuery } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSelector } from "react-redux";

import { buildLiveHlsConfig } from "../../helpers/live";
import LiveStreamInfoTooltip, { formatDuration } from "./LiveStreamInfoTooltip";

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const getSeekableWindow = (video) => {
	if (!video?.seekable?.length) return null;

	const index = video.seekable.length - 1;
	const start = video.seekable.start(index);
	const end = video.seekable.end(index);

	if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
	return { start, end };
};

const buildSyncTuning = (targetDuration) => {
	const segmentDuration = Number(targetDuration) > 0 ? Number(targetDuration) : 2;

	// Normal HLS playback should not chase the newest segment directly.
	// Stay a few segments behind the live edge so the browser has a stable buffer.
	const targetLatency = Math.max(segmentDuration * 2, 4);
	const maxLatency = Math.max(targetLatency + segmentDuration * 2, targetLatency + 6);

	return {
		segmentDuration,
		targetLatency,
		maxLatency,
	};
};

function LiveStreamPlayer({ stream, sx }) {
	const theme = useTheme();
	const alwaysShowControls = useMediaQuery(theme.breakpoints.down("sm"));
	const authToken = useSelector((state) => state.auth.authToken);
	const authTokenRef = useRef(authToken);
	const videoRef = useRef(null);
	const playerRef = useRef(null);
	const hlsRef = useRef(null);
	const syncIntervalRef = useRef(null);
	const hasInitialSyncedRef = useRef(false);
	const [playerState, setPlayerState] = useState({
		isPlaying: false,
		isMuted: false,
		volume: 0.85,
		latency: null,
		syncLabel: "Waiting for stream",
		error: "",
	});

	const targetDuration = stream?.mediaInfo?.mediaPlaylist?.targetDuration || 2;
	const syncTuning = useMemo(() => buildSyncTuning(targetDuration), [targetDuration]);

	useEffect(() => {
		authTokenRef.current = authToken;
	}, [authToken]);

	const setPlayerValue = useCallback((patch) => {
		setPlayerState((current) => ({
			...current,
			...patch,
		}));
	}, []);

	const syncToLive = useCallback(
		({ force = false } = {}) => {
			const video = videoRef.current;
			const seekableWindow = getSeekableWindow(video);

			if (!video || !seekableWindow) {
				return;
			}

			const { start, end } = seekableWindow;
			const availableWindow = Math.max(0, end - start);
			const targetLatency = Math.min(syncTuning.targetLatency, Math.max(syncTuning.segmentDuration, availableWindow * 0.5));
			const currentTime = Number.isFinite(video.currentTime) ? video.currentTime : start;
			const targetTime = clamp(end - targetLatency, start, end);
			const latency = Math.max(0, end - currentTime);

			const driftedPastWindow = currentTime < start || currentTime > end;
			const tooFarBehind = latency > syncTuning.maxLatency;

			// Act like a normal streaming service: avoid constantly nudging playback.
			// Seek only when the user asks, when playback starts, or when we have fallen badly behind.
			if (force || driftedPastWindow || tooFarBehind) {
				video.currentTime = targetTime;
				video.playbackRate = 1;

				setPlayerValue({
					latency: Math.max(0, end - targetTime),
					syncLabel: `Near live (${formatDuration(Math.max(0, end - targetTime))})`,
				});
				return;
			}

			video.playbackRate = 1;
			setPlayerValue({
				latency,
				syncLabel: `Live latency ${formatDuration(latency)}`,
			});
		},
		[setPlayerValue, syncTuning]
	);

	useEffect(() => {
		const video = videoRef.current;
		if (!video) return;

		video.volume = playerState.volume;
		video.muted = playerState.isMuted;
	}, [playerState.isMuted, playerState.volume]);

	useEffect(() => {
		const video = videoRef.current;
		if (!video || !stream?.isPlayable || !stream?.playbackUrl) {
			return undefined;
		}

		hasInitialSyncedRef.current = false;

		setPlayerValue({
			isPlaying: false,
			error: "",
			syncLabel: "Preparing live stream",
			latency: null,
		});

		const syncOnceWhenSeekable = () => {
			if (hasInitialSyncedRef.current || !getSeekableWindow(video)) return;

			hasInitialSyncedRef.current = true;
			syncToLive({ force: true });
		};

		const handleLoadedMetadata = syncOnceWhenSeekable;
		const handleCanPlay = syncOnceWhenSeekable;
		const handlePlay = () => {
			setPlayerValue({ isPlaying: true });
			syncOnceWhenSeekable();
		};
		const handlePause = () => {
			video.playbackRate = 1;
			setPlayerValue({ isPlaying: false });
		};
		const handleWaiting = () => {
			video.playbackRate = 1;
			setPlayerValue({ syncLabel: "Buffering" });
		};
		const handlePlaying = () => setPlayerValue({ syncLabel: "Near live" });
		const handleVolumeChange = () => {
			setPlayerValue({
				isMuted: video.muted,
				volume: video.volume,
			});
		};

		video.addEventListener("loadedmetadata", handleLoadedMetadata);
		video.addEventListener("canplay", handleCanPlay);
		video.addEventListener("play", handlePlay);
		video.addEventListener("pause", handlePause);
		video.addEventListener("waiting", handleWaiting);
		video.addEventListener("playing", handlePlaying);
		video.addEventListener("volumechange", handleVolumeChange);

		if (Hls.isSupported()) {
			const hls = new Hls({
				...buildLiveHlsConfig(() => authTokenRef.current),
				enableWorker: true,
				lowLatencyMode: false,
				backBufferLength: 30,
				liveSyncDuration: syncTuning.targetLatency,
				liveMaxLatencyDuration: syncTuning.maxLatency,
				maxLiveSyncPlaybackRate: 1,
			});

			hlsRef.current = hls;
			hls.on(Hls.Events.ERROR, (_event, data) => {
				if (!data?.fatal) return;

				if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
					hls.startLoad();
					setPlayerValue({ syncLabel: "Reconnecting" });
					return;
				}

				if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
					hls.recoverMediaError();
					setPlayerValue({ syncLabel: "Recovering playback" });
					return;
				}

				setPlayerValue({ error: "The stream could not be played in this browser." });
				hls.destroy();
			});
			hls.on(Hls.Events.MANIFEST_PARSED, syncOnceWhenSeekable);
			hls.on(Hls.Events.LEVEL_LOADED, syncOnceWhenSeekable);
			hls.on(Hls.Events.FRAG_BUFFERED, syncOnceWhenSeekable);
			hls.loadSource(stream.playbackUrl);
			hls.attachMedia(video);
		} else if (video.canPlayType("application/vnd.apple.mpegurl")) {
			video.src = stream.playbackUrl;
			video.load();
		} else {
			setPlayerValue({ error: "This browser does not support HLS playback." });
		}

		syncIntervalRef.current = window.setInterval(() => {
			if (!video.paused && !video.seeking) {
				syncToLive();
			}
		}, 2000);

		// Try to auto play when stream switches or is loaded and playable.
		const tryAutoPlay = async () => {
			try {
				await video.play();
				setPlayerValue({ error: "" });
			} catch (_err) {
				// Autoplay failed (maybe due to user gesture policies).
				// Do not set error so error UI is not shown unless "real" error.
			}
		};

		if (stream?.isPlayable) {
			tryAutoPlay();
		}

		return () => {
			window.clearInterval(syncIntervalRef.current);
			syncIntervalRef.current = null;

			if (hlsRef.current) {
				hlsRef.current.destroy();
				hlsRef.current = null;
			}

			video.pause();
			video.removeAttribute("src");
			video.load();
			video.playbackRate = 1;
			video.removeEventListener("loadedmetadata", handleLoadedMetadata);
			video.removeEventListener("canplay", handleCanPlay);
			video.removeEventListener("play", handlePlay);
			video.removeEventListener("pause", handlePause);
			video.removeEventListener("waiting", handleWaiting);
			video.removeEventListener("playing", handlePlaying);
			video.removeEventListener("volumechange", handleVolumeChange);
		};
	}, [setPlayerValue, stream?.isPlayable, stream?.playbackUrl, syncToLive]);

	const handleTogglePlayback = async () => {
		const video = videoRef.current;
		if (!video || !stream?.isPlayable) return;

		if (video.paused) {
			try {
				if (!hasInitialSyncedRef.current) {
					hasInitialSyncedRef.current = true;
					syncToLive({ force: true });
				}
				await video.play();
				setPlayerValue({ error: "" });
			} catch (_err) {
				setPlayerValue({ error: "Playback needs a direct click in this browser." });
			}
			return;
		}

		video.pause();
	};

	const handleToggleMute = () => {
		const video = videoRef.current;
		if (!video) return;

		video.muted = !video.muted;
		setPlayerValue({ isMuted: video.muted });
	};

	const handleVolumeChange = (_event, value) => {
		const video = videoRef.current;
		const volume = Array.isArray(value) ? value[0] : value;
		if (!video) return;

		video.volume = clamp(Number(volume) / 100, 0, 1);
		if (video.volume > 0) {
			video.muted = false;
		}
	};

	const handleFullscreen = () => {
		const target = playerRef.current;
		const video = videoRef.current;

		if (target?.requestFullscreen) {
			void target.requestFullscreen();
			return;
		}

		if (video?.webkitEnterFullscreen) {
			video.webkitEnterFullscreen();
		}
	};

	const controlOpacity = alwaysShowControls ? 1 : undefined;
	const showUnavailableState = !stream || !stream.isPlayable;

	return (
		<Box
			ref={playerRef}
			sx={{
				position: "relative",
				width: "100%",
				aspectRatio: "16 / 9",
				minHeight: 240,
				overflow: "hidden",
				borderRadius: 1,
				bgcolor: "#090909",
				border: (activeTheme) => `1px solid ${alpha(activeTheme.palette.common.white, 0.12)}`,
				boxShadow: (activeTheme) => `0 20px 60px ${alpha(activeTheme.palette.common.black, 0.38)}`,
				"&:hover .LiveStreamPlayer-controls, &:focus-within .LiveStreamPlayer-controls": {
					opacity: 1,
					transform: "translateY(0)",
				},
				...sx,
			}}>
			<video
				ref={videoRef}
				autoPlay
				playsInline
				style={{
					width: "100%",
					height: "100%",
					display: "block",
					objectFit: "contain",
					backgroundColor: "#050505",
				}}
			/>

			<Box
				sx={{
					position: "absolute",
					top: 0,
					left: 0,
					right: 0,
					p: 1.25,
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
					background: `linear-gradient(180deg, ${alpha("#000", 0.68)}, ${alpha("#000", 0)})`,
					pointerEvents: "none",
				}}>
				<Stack direction="row" spacing={1} alignItems="center">
					<Chip
						color={stream?.isPlayable ? "error" : "default"}
						size="small"
						label={stream?.isPlayable ? "LIVE" : "WAITING"}
						sx={{ fontWeight: 700, pointerEvents: "auto" }}
					/>
					<Typography variant="body2" sx={{ color: "common.white", textShadow: "0 1px 4px rgba(0,0,0,0.8)" }}>
						{stream?.label || "Select a stream"}
					</Typography>
				</Stack>
				{stream ? (
					<LiveStreamInfoTooltip
						stream={stream}
						sx={{
							pointerEvents: "auto",
							color: "common.white",
							bgcolor: alpha("#000", 0.36),
							"&:hover": { bgcolor: alpha("#000", 0.55) },
						}}
					/>
				) : null}
			</Box>

			{showUnavailableState ? (
				<Box
					sx={{
						position: "absolute",
						inset: 0,
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						p: 3,
						textAlign: "center",
					}}>
					<Stack spacing={1} alignItems="center">
						<Typography variant="h6" sx={{ color: "common.white" }}>
							{stream ? "Waiting for playable media" : "Choose a stream"}
						</Typography>
						<Typography variant="body2" sx={{ color: alpha("#fff", 0.72), maxWidth: 420 }}>
							{stream ? "Waiting for HLS playlists and current media segments." : "No stream selected."}
						</Typography>
					</Stack>
				</Box>
			) : null}

			{playerState.error ? (
				<Box
					sx={{
						position: "absolute",
						left: 12,
						right: 12,
						bottom: 86,
						p: 1,
						borderRadius: 1,
						bgcolor: alpha(theme.palette.error.dark, 0.88),
						color: "common.white",
					}}>
					<Typography variant="body2">{playerState.error}</Typography>
				</Box>
			) : null}

			<Box
				className="LiveStreamPlayer-controls"
				sx={{
					position: "absolute",
					left: 0,
					right: 0,
					bottom: 0,
					p: 1.25,
					opacity: controlOpacity ?? 0,
					transform: controlOpacity ? "translateY(0)" : "translateY(8px)",
					transition: "opacity 160ms ease, transform 160ms ease",
					background: `linear-gradient(0deg, ${alpha("#000", 0.78)}, ${alpha("#000", 0.06)})`,
				}}>
				{stream?.isPlayable && !playerState.isPlaying ? (
					<LinearProgress
						variant="determinate"
						value={100}
						sx={{
							position: "absolute",
							left: 0,
							right: 0,
							bottom: 0,
							height: 2,
							opacity: 0.85,
						}}
					/>
				) : null}
				<Stack direction="row" spacing={1} alignItems="center">
					<Tooltip title={playerState.isPlaying ? "Pause" : "Play"}>
						<span>
							<IconButton
								onClick={handleTogglePlayback}
								disabled={!stream?.isPlayable}
								sx={{ color: "common.white" }}
								aria-label={playerState.isPlaying ? "Pause" : "Play"}>
								{playerState.isPlaying ? <PauseRounded /> : <PlayArrowRounded />}
							</IconButton>
						</span>
					</Tooltip>
					<Tooltip title="Sync near live">
						<span>
							<IconButton onClick={() => syncToLive({ force: true })} disabled={!stream?.isPlayable} sx={{ color: "common.white" }} aria-label="Sync near live">
								<SyncRounded />
							</IconButton>
						</span>
					</Tooltip>
					<Chip
						size="small"
						label={playerState.syncLabel}
						sx={{
							color: "common.white",
							bgcolor: alpha("#fff", 0.13),
							display: { xs: "none", sm: "inline-flex" },
						}}
					/>
					<Box sx={{ flexGrow: 1 }} />
					<Tooltip title={playerState.isMuted ? "Unmute" : "Mute"}>
						<span>
							<IconButton
								onClick={handleToggleMute}
								disabled={!stream?.isPlayable}
								sx={{ color: "common.white" }}
								aria-label={playerState.isMuted ? "Unmute" : "Mute"}>
								{playerState.isMuted || playerState.volume === 0 ? <VolumeOffRounded /> : <VolumeUpRounded />}
							</IconButton>
						</span>
					</Tooltip>
					<Slider
						size="small"
						value={playerState.isMuted ? 0 : Math.round(playerState.volume * 100)}
						onChange={handleVolumeChange}
						disabled={!stream?.isPlayable}
						aria-label="Volume"
						sx={{
							width: { xs: 72, sm: 120 },
							color: "common.white",
							"& .MuiSlider-thumb": {
								width: 12,
								height: 12,
							},
						}}
					/>
					<Tooltip title="Fullscreen">
						<span>
							<IconButton onClick={handleFullscreen} disabled={!stream} sx={{ color: "common.white" }} aria-label="Fullscreen">
								<FullscreenRounded />
							</IconButton>
						</span>
					</Tooltip>
				</Stack>
			</Box>
		</Box>
	);
}

export default LiveStreamPlayer;
