import LaunchRounded from "@mui/icons-material/LaunchRounded";
import DesktopWindowsRounded from "@mui/icons-material/DesktopWindowsRounded";
import RefreshRounded from "@mui/icons-material/RefreshRounded";
import SensorsRounded from "@mui/icons-material/SensorsRounded";
import { Alert, Box, Button, Chip, CircularProgress, Divider, IconButton, Paper, Stack, Tooltip, Typography } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import React, { useEffect, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";

import LiveStreamInfoTooltip, { formatBytes, formatDateTime, formatDuration } from "../../components/Live/LiveStreamInfoTooltip";
import LiveStreamPlayer from "../../components/Live/LiveStreamPlayer";
import { buildLiveFetchConfig, getLiveStreamsApiUrl } from "../../helpers/live";
import { setDialogOpened } from "../../slices/dialogSlice";
import { scrollbarStyles } from "../scrollbarStyles";

const getStatusColor = (status) => {
	if (status === "active") return "success";
	if (status === "ended") return "warning";
	if (status === "expired") return "default";
	return "default";
};

const getStreamTitle = (stream) => stream?.label || "Live session";

const StatusChip = ({ stream }) => (
	<Chip color={getStatusColor(stream.status)} size="small" label={stream.status ? stream.status.toUpperCase() : "UNKNOWN"} sx={{ fontWeight: 700 }} />
);

const StreamMetric = ({ label, value }) => (
	<Stack spacing={0.25}>
		<Typography variant="caption" color="text.secondary">
			{label}
		</Typography>
		<Typography variant="body2">{value || "Unavailable"}</Typography>
	</Stack>
);

const StreamListItem = ({ stream, selected, onSelect }) => {
	const theme = useTheme();
	const master = stream.mediaInfo?.masterPlaylist || {};
	const media = stream.mediaInfo?.mediaPlaylist || {};

	return (
		<Paper
			role="button"
			tabIndex={0}
			variant="outlined"
			data-testid="available-stream-list-item"
			data-stream-session-id={stream.sessionId || ""}
			data-stream-playable={stream.isPlayable ? "true" : "false"}
			aria-label={`Select stream ${getStreamTitle(stream)}`}
			aria-pressed={selected}
			onClick={() => onSelect(stream.sessionId)}
			onKeyDown={(event) => {
				if (event.key === "Enter" || event.key === " ") {
					event.preventDefault();
					onSelect(stream.sessionId);
				}
			}}
			sx={{
				width: "100%",
				p: 1.5,
				textAlign: "left",
				cursor: "pointer",
				outline: "none",
				color: "text.primary",
				bgcolor: selected ? alpha(theme.palette.primary.main, 0.18) : "background.paper",
				borderColor: selected ? theme.palette.primary.main : "divider",
				transition: "border-color 140ms ease, background-color 140ms ease",
				"&:hover": {
					borderColor: selected ? theme.palette.primary.light : alpha(theme.palette.text.primary, 0.45),
					bgcolor: selected ? alpha(theme.palette.primary.main, 0.24) : alpha(theme.palette.text.primary, 0.04),
				},
			}}>
			<Stack spacing={1}>
				<Stack direction="row" spacing={1} alignItems="flex-start" justifyContent="space-between">
					<Stack spacing={0.25} sx={{ minWidth: 0 }}>
						<Typography variant="subtitle1" noWrap>
							{getStreamTitle(stream)}
						</Typography>
						<Typography variant="caption" color="text.secondary" noWrap>
							Updated {formatDateTime(stream.lastHeartbeatAt)}
						</Typography>
					</Stack>
					<Stack direction="row" spacing={0.5} alignItems="center">
						<StatusChip stream={stream} />
						<LiveStreamInfoTooltip stream={stream} />
					</Stack>
				</Stack>
				<Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
					<Chip size="small" variant="outlined" label={stream.isPlayable ? "Playable" : "Pending"} />
					<Chip size="small" variant="outlined" label={master.resolution || "No resolution"} />
					<Chip size="small" variant="outlined" label={`${media.segmentCount ?? 0} playlist segments`} />
					<Chip size="small" variant="outlined" label={`${stream.mediaInfo?.retainedSegmentCount ?? 0} retained`} />
				</Stack>
			</Stack>
		</Paper>
	);
};

const SelectedStreamDetails = ({ stream }) => {
	if (!stream) return null;

	const master = stream.mediaInfo?.masterPlaylist || {};
	const media = stream.mediaInfo?.mediaPlaylist || {};
	const latestSegment = stream.mediaInfo?.latestSegment || {};

	return (
		<Paper variant="outlined" sx={{ p: 2 }} data-testid="selected-stream-details" data-stream-session-id={stream.sessionId || ""}>
			<Stack spacing={1.5}>
				<Stack direction={{ xs: "column", md: "row" }} spacing={1} alignItems={{ xs: "flex-start", md: "center" }} justifyContent="space-between">
					<Stack spacing={0.25}>
						<Typography variant="h6">{getStreamTitle(stream)}</Typography>
						<Typography variant="body2" color="text.secondary">
							{stream.sessionId}
						</Typography>
					</Stack>
					<Stack direction="row" spacing={1} alignItems="center">
						<StatusChip stream={stream} />
						<Button size="small" variant="outlined" href={stream.shareUrl} target="_blank" rel="noreferrer" startIcon={<LaunchRounded />}>
							Share
						</Button>
					</Stack>
				</Stack>
				<Divider />
				<Box
					sx={{
						display: "grid",
						gridTemplateColumns: {
							xs: "1fr 1fr",
							md: "repeat(4, minmax(0, 1fr))",
						},
						gap: 1.5,
					}}>
					<StreamMetric label="Resolution" value={master.resolution} />
					<StreamMetric label="Codecs" value={master.codecs} />
					<StreamMetric label="Target Duration" value={formatDuration(media.targetDuration)} />
					<StreamMetric label="Playlist Window" value={formatDuration(media.totalDuration)} />
					<StreamMetric label="Media Sequence" value={media.mediaSequence ?? ""} />
					<StreamMetric label="Latest Segment" value={latestSegment.filename || media.latestSegmentUri} />
					<StreamMetric label="Latest Size" value={latestSegment.byteSize ? formatBytes(latestSegment.byteSize) : ""} />
					<StreamMetric label="Total Retained" value={formatBytes(stream.mediaInfo?.totalRetainedBytes)} />
				</Box>
			</Stack>
		</Paper>
	);
};

function AvailableStreamsPage() {
	const dispatch = useDispatch();
	const navigate = useNavigate();
	const auth = useSelector((state) => state.auth);
	const [state, setState] = useState({
		loading: true,
		refreshing: false,
		error: "",
		streams: [],
		generatedAt: null,
	});
	const [selectedId, setSelectedId] = useState("");

	useEffect(() => {
		if (!auth.loggedIn || !auth.authToken) {
			return undefined;
		}

		let mounted = true;

		const loadStreams = async (silent = false) => {
			try {
				if (mounted) {
					setState((current) => ({
						...current,
						loading: silent ? current.loading : true,
						refreshing: silent,
						error: "",
					}));
				}

				const response = await fetch(
					getLiveStreamsApiUrl(),
					buildLiveFetchConfig(auth.authToken, {
						headers: {
							Accept: "application/json",
						},
					})
				);

				if (!response.ok) {
					const payload = await response.json().catch(() => ({}));
					throw new Error(payload.error || "Unable to load available streams.");
				}

				const payload = await response.json();
				if (!mounted) return;

				setState({
					loading: false,
					refreshing: false,
					error: "",
					streams: Array.isArray(payload.streams) ? payload.streams : [],
					generatedAt: payload.generatedAt || new Date().toISOString(),
				});
			} catch (err) {
				if (!mounted) return;
				setState((current) => ({
					...current,
					loading: false,
					refreshing: false,
					error: err.message || "Unable to load available streams.",
				}));
			}
		};

		loadStreams(false);
		const refreshTimer = window.setInterval(() => loadStreams(true), 5000);

		return () => {
			mounted = false;
			window.clearInterval(refreshTimer);
		};
	}, [auth.loggedIn, auth.authToken]);

	useEffect(() => {
		if (!state.streams.length) {
			setSelectedId("");
			return;
		}

		const stillSelected = state.streams.some((stream) => stream.sessionId === selectedId);
		if (selectedId && stillSelected) return;

		const firstPlayable = state.streams.find((stream) => stream.isPlayable);
		setSelectedId((firstPlayable || state.streams[0]).sessionId);
	}, [selectedId, state.streams]);

	const selectedStream = useMemo(() => state.streams.find((stream) => stream.sessionId === selectedId) || null, [selectedId, state.streams]);
	const activeCount = state.streams.filter((stream) => stream.status === "active").length;
	const playableCount = state.streams.filter((stream) => stream.isPlayable).length;

	const handleRefresh = async () => {
		if (!auth.loggedIn || !auth.authToken) return;

		setState((current) => ({ ...current, refreshing: true }));

		try {
			const response = await fetch(getLiveStreamsApiUrl(), buildLiveFetchConfig(auth.authToken, { headers: { Accept: "application/json" } }));

			if (!response.ok) {
				const payload = await response.json().catch(() => ({}));
				throw new Error(payload.error || "Unable to refresh available streams.");
			}

			const payload = await response.json();
			setState({
				loading: false,
				refreshing: false,
				error: "",
				streams: Array.isArray(payload.streams) ? payload.streams : [],
				generatedAt: payload.generatedAt || new Date().toISOString(),
			});
		} catch (err) {
			setState((current) => ({
				...current,
				refreshing: false,
				error: err.message || "Unable to refresh available streams.",
			}));
		}
	};

	const handleLogin = () => {
		dispatch(
			setDialogOpened({
				dialogName: "loginDialogOpen",
				newState: true,
				conflictingDialogs: ["registerDialogOpen"],
			})
		);
	};

	if (auth.loggingIn) {
		return (
			<Stack spacing={1.5} alignItems="center" justifyContent="center" sx={{ minHeight: 240 }}>
				<CircularProgress size={26} />
				<Typography variant="body2" color="text.secondary">
					Checking login
				</Typography>
			</Stack>
		);
	}

	if (!auth.loggedIn) {
		return (
			<Box sx={{ width: "100%" }} data-testid="available-streams-login-required">
				<Alert
					severity="info"
					action={
						<Button color="inherit" size="small" onClick={handleLogin}>
							Log In
						</Button>
					}>
					Log in to view live streams.
				</Alert>
			</Box>
		);
	}

	return (
		<Box
			data-testid="available-streams-page"
			sx={{
				flexGrow: 1,
				width: "100%",
				height: "100%",
				overflow: "hidden",
			}}>
			<Stack spacing={2} sx={{ height: "100%", minWidth: 0 }}>
				<Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} alignItems={{ xs: "flex-start", sm: "center" }} justifyContent="space-between">
					<Stack direction="row" spacing={1.5} alignItems="center" sx={{ minWidth: 0 }}>
						<SensorsRounded color="primary" sx={{ fontSize: 34 }} />
						<Stack spacing={0.25} sx={{ minWidth: 0 }}>
							<Typography variant="h5">Available Streams</Typography>
							<Typography variant="body2" color="text.secondary">
								{state.generatedAt ? `Refreshed ${formatDateTime(state.generatedAt)}` : "Loading stream list"}
							</Typography>
						</Stack>
					</Stack>
					<Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap">
						<Chip size="small" label={`${state.streams.length} total`} data-testid="available-streams-total-count" />
						<Chip size="small" color="success" label={`${activeCount} active`} data-testid="available-streams-active-count" />
						<Chip size="small" color="primary" label={`${playableCount} playable`} data-testid="available-streams-playable-count" />
						{window.isElectron ? (
							<Button size="small" variant="contained" startIcon={<DesktopWindowsRounded />} onClick={() => navigate("/live/broadcast")}>
								Go Live
							</Button>
						) : null}
						<Tooltip title="Refresh streams">
							<span>
								<IconButton onClick={handleRefresh} disabled={state.refreshing} aria-label="Refresh streams" data-testid="available-streams-refresh-button">
									{state.refreshing ? <CircularProgress size={20} /> : <RefreshRounded />}
								</IconButton>
							</span>
						</Tooltip>
					</Stack>
				</Stack>

				{state.error ? <Alert severity="error">{state.error}</Alert> : null}

				<Box
					sx={{
						display: "grid",
						gridTemplateColumns: { xs: "1fr", lg: "360px minmax(0, 1fr)" },
						gap: 2,
						minHeight: 0,
						flexGrow: 1,
					}}>
					<Paper
						variant="outlined"
						data-testid="available-streams-list-panel"
						sx={{
							minHeight: 0,
							overflow: "hidden",
							display: "flex",
							flexDirection: "column",
						}}>
						<Stack spacing={1} sx={{ p: 1.5, borderBottom: (theme) => `1px solid ${theme.palette.divider}` }}>
							<Typography variant="subtitle1">Stream List</Typography>
						</Stack>
						<Box
							sx={{
								flexGrow: 1,
								overflowY: "auto",
								overflowX: "hidden",
								p: 1.5,
								...scrollbarStyles,
							}}>
							{state.loading ? (
								<Stack spacing={1.5} alignItems="center" justifyContent="center" sx={{ minHeight: 240 }} data-testid="available-streams-loading-state">
									<CircularProgress size={26} />
									<Typography variant="body2" color="text.secondary">
										Loading streams
									</Typography>
								</Stack>
							) : null}

							{!state.loading && !state.streams.length ? (
								<Stack spacing={1} alignItems="center" justifyContent="center" sx={{ minHeight: 240 }} data-testid="available-streams-empty-state">
									<Typography variant="body1">No streams are available.</Typography>
								</Stack>
							) : null}

							{!state.loading && state.streams.length ? (
								<Stack spacing={1.25}>
									{state.streams.map((stream) => (
										<StreamListItem key={stream.sessionId} stream={stream} selected={stream.sessionId === selectedId} onSelect={setSelectedId} />
									))}
								</Stack>
							) : null}
						</Box>
						{window?.isElectron ? (
							<Stack spacing={1} sx={{ p: 1.5, borderTop: (theme) => `1px solid ${theme.palette.divider}`, minHeight: "64px" }}>
								<div style={{ textDecoration: "none", display: "block", width: "100%", height: "100%" }}>
									<Chip
										data-testid="available-streams-share-my-stream"
										label="Share My Stream URL"
										color="info"
										clickable
										sx={{
											width: "100%",
											height: "100%",
											fontWeight: 700,
											cursor: "pointer",
											transition: "transform 160ms ease, box-shadow 160ms ease, filter 160ms ease",
											boxShadow: (theme) => `0 0 8px ${theme.palette.info.main}`,
											animation: "chipGlow 0.8s ease-in-out infinite alternate",

											"&:hover": {
												transform: "translateY(-1px) scale(1.03)",
												filter: "brightness(1.08)",
												boxShadow: (theme) => `0 0 12px ${theme.palette.info.main}, 0 0 24px ${theme.palette.info.main}`,
											},

											"&:active": {
												transform: "translateY(0) scale(0.98)",
											},

											"@keyframes chipGlow": {
												from: {
													boxShadow: (theme) => `0 0 4px ${theme.palette.info.main}`,
												},
												to: {
													boxShadow: (theme) => `0 0 10px ${theme.palette.info.main}, 0 0 16px ${theme.palette.info.main}`,
												},
											},
										}}
									/>
								</div>
							</Stack>
						) : (
							<Stack spacing={1} sx={{ p: 1.5, borderTop: (theme) => `1px solid ${theme.palette.divider}`, minHeight: "64px" }}>
								<a
									href="https://github.com/BrandonCasa/rebound-chat/releases/latest"
									target="_blank"
									rel="noopener noreferrer"
									style={{ textDecoration: "none", display: "block", width: "100%", height: "100%" }}>
									<Chip
										data-testid="available-streams-download-app"
										label="Download App to Stream!"
										color="info"
										clickable
										sx={{
											width: "100%",
											height: "100%",
											fontWeight: 700,
											cursor: "pointer",
											transition: "transform 160ms ease, box-shadow 160ms ease, filter 160ms ease",
											boxShadow: (theme) => `0 0 8px ${theme.palette.info.main}`,
											animation: "chipGlow 0.8s ease-in-out infinite alternate",

											"&:hover": {
												transform: "translateY(-1px) scale(1.03)",
												filter: "brightness(1.08)",
												boxShadow: (theme) => `0 0 12px ${theme.palette.info.main}, 0 0 24px ${theme.palette.info.main}`,
											},

											"&:active": {
												transform: "translateY(0) scale(0.98)",
											},

											"@keyframes chipGlow": {
												from: {
													boxShadow: (theme) => `0 0 4px ${theme.palette.info.main}`,
												},
												to: {
													boxShadow: (theme) => `0 0 10px ${theme.palette.info.main}, 0 0 16px ${theme.palette.info.main}`,
												},
											},
										}}
									/>
								</a>
							</Stack>
						)}
					</Paper>

					<Stack spacing={2} sx={{ minWidth: 0, minHeight: 0, overflowY: "auto", overflowX: "hidden", pr: 0.5, ...scrollbarStyles }}>
						<LiveStreamPlayer stream={selectedStream} />
						<SelectedStreamDetails stream={selectedStream} />
					</Stack>
				</Box>
			</Stack>
		</Box>
	);
}

export default AvailableStreamsPage;
