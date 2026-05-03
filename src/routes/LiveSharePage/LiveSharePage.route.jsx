import ContentCopyRounded from "@mui/icons-material/ContentCopyRounded";
import LaunchRounded from "@mui/icons-material/LaunchRounded";
import { Alert, Box, Button, Chip, CircularProgress, Divider, Paper, Stack, Typography } from "@mui/material";
import React, { useEffect, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useParams } from "react-router-dom";

import LandingHeader from "../../components/LandingHeader";
import LiveStreamPlayer from "../../components/Live/LiveStreamPlayer";
import { buildLiveFetchConfig, getLiveShareApiUrl } from "../../helpers/live";
import { setDialogOpened } from "../../slices/dialogSlice";
import { scrollbarStyles } from "../scrollbarStyles";

const formatDateTime = (value) => {
	if (!value) return "Unavailable";

	try {
		return new Intl.DateTimeFormat(undefined, {
			dateStyle: "medium",
			timeStyle: "medium",
		}).format(new Date(value));
	} catch (_err) {
		return "Unavailable";
	}
};

const getStatusColor = (status) => {
	if (status === "active") return "success";
	if (status === "ended") return "warning";
	return "default";
};

function LiveSharePage() {
	const { publicToken } = useParams();
	const dispatch = useDispatch();
	const auth = useSelector((state) => state.auth);
	const [state, setState] = useState({
		loading: true,
		error: "",
		data: null,
		copyState: "",
	});

	useEffect(() => {
		if (!auth.loggedIn || !auth.authToken) {
			return undefined;
		}

		let ignore = false;

		const loadShare = async () => {
			try {
				setState((current) => ({
					...current,
					loading: true,
					error: "",
				}));

				const response = await fetch(getLiveShareApiUrl(publicToken), buildLiveFetchConfig(auth.authToken));

				if (!response.ok) {
					const payload = await response.json().catch(() => ({}));
					throw new Error(payload.error || "The live share page is unavailable.");
				}

				const payload = await response.json();
				if (ignore) return;

				setState({
					loading: false,
					error: "",
					data: payload,
					copyState: "",
				});
			} catch (err) {
				if (ignore) return;

				setState({
					loading: false,
					error: err.message || "The live share page is unavailable.",
					data: null,
					copyState: "",
				});
			}
		};

		loadShare();

		return () => {
			ignore = true;
		};
	}, [auth.loggedIn, auth.authToken, publicToken]);

	const liveStatusLabel = useMemo(() => {
		if (!state.data?.status) return "Unavailable";
		return state.data.status.charAt(0).toUpperCase() + state.data.status.slice(1);
	}, [state.data]);

	const handleCopy = async () => {
		if (!state.data?.playbackUrl || !navigator?.clipboard?.writeText) {
			setState((current) => ({
				...current,
				copyState: "Copy is unavailable in this browser.",
			}));
			return;
		}

		try {
			await navigator.clipboard.writeText(state.data.playbackUrl);
			setState((current) => ({
				...current,
				copyState: "Playback URL copied.",
			}));
		} catch (_err) {
			setState((current) => ({
				...current,
				copyState: "Copy failed. Open the URL directly in VLC.",
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

	return (
		<Box
			sx={{
				display: "flex",
				justifyContent: "center",
				flexGrow: 1,
				overflow: "hidden",
			}}>
			<Stack spacing={2} sx={{ width: "100%", height: "100%" }}>
				<LandingHeader title="Live Share" subtitle="Watch the stream from a logged-in session." />
				<Box
					sx={{
						width: "100%",
						flexGrow: 1,
						overflowY: "auto",
						overflowX: "hidden",
						pr: 0.5,
						...scrollbarStyles,
					}}>
					<Stack spacing={2}>
						{auth.loggingIn ? (
							<Paper variant="outlined" sx={{ p: 3, minHeight: 180 }}>
								<Stack spacing={2} alignItems="center" justifyContent="center" sx={{ height: "100%" }}>
									<CircularProgress size={28} />
									<Typography variant="body2" color="text.secondary">
										Checking login
									</Typography>
								</Stack>
							</Paper>
						) : null}

						{!auth.loggingIn && !auth.loggedIn ? (
							<Alert
								severity="info"
								action={
									<Button color="inherit" size="small" onClick={handleLogin}>
										Log In
									</Button>
								}>
								Log in to view this live stream.
							</Alert>
						) : null}

						{auth.loggedIn && state.loading ? (
							<Paper variant="outlined" sx={{ p: 3, minHeight: 180 }}>
								<Stack spacing={2} alignItems="center" justifyContent="center" sx={{ height: "100%" }}>
									<CircularProgress size={28} />
									<Typography variant="body2" color="text.secondary">
										Loading live session details.
									</Typography>
								</Stack>
							</Paper>
						) : null}

						{auth.loggedIn && !state.loading && state.error ? <Alert severity="error">{state.error}</Alert> : null}

						{auth.loggedIn && !state.loading && state.data ? (
							<>
								<LiveStreamPlayer stream={state.data} />

								<Paper variant="outlined" sx={{ p: 2.5 }}>
									<Stack spacing={1.5}>
										<Stack direction={{ xs: "column", sm: "row" }} spacing={1} alignItems={{ xs: "flex-start", sm: "center" }} justifyContent="space-between">
											<Stack spacing={0.5}>
												<Typography variant="h6">{state.data.label || "Live session"}</Typography>
												<Typography variant="body2" color="text.secondary">
													Direct playlist access requires your logged-in browser session.
												</Typography>
											</Stack>
											<Chip color={getStatusColor(state.data.status)} label={liveStatusLabel} size="small" />
										</Stack>
										<Box
											sx={{
												p: 1.5,
												border: (theme) => `1px solid ${theme.palette.divider}`,
												borderRadius: 1,
												bgcolor: "background.default",
											}}>
											<Typography
												component="code"
												sx={{
													display: "block",
													fontFamily: "monospace",
													fontSize: "0.875rem",
													wordBreak: "break-all",
												}}>
												{state.data.playbackUrl}
											</Typography>
										</Box>
										<Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
											<Button variant="contained" startIcon={<ContentCopyRounded />} onClick={handleCopy}>
												Copy Playlist URL
											</Button>
											<Button variant="outlined" href={state.data.playbackUrl} target="_blank" rel="noreferrer" startIcon={<LaunchRounded />}>
												Open Playlist URL
											</Button>
										</Stack>
										{state.copyState ? (
											<Typography variant="body2" color="text.secondary">
												{state.copyState}
											</Typography>
										) : null}
									</Stack>
								</Paper>

								<Paper variant="outlined" sx={{ p: 2.5 }}>
									<Stack spacing={1.25}>
										<Typography variant="h6">Session State</Typography>
										<Divider />
										<Typography variant="body2" color="text.secondary">
											Created: {formatDateTime(state.data.createdAt)}
										</Typography>
										<Typography variant="body2" color="text.secondary">
											Last sender heartbeat: {formatDateTime(state.data.lastHeartbeatAt)}
										</Typography>
										<Typography variant="body2" color="text.secondary">
											Current expiry: {formatDateTime(state.data.expiresAt)}
										</Typography>
										<Typography variant="body2" color="text.secondary">
											Recent retained media files: {state.data.recentSegmentCount}
										</Typography>
										<Typography variant="body2" color="text.secondary">
											Target segment duration:{" "}
											{state.data.mediaInfo?.mediaPlaylist?.targetDuration ? `${state.data.mediaInfo.mediaPlaylist.targetDuration}s` : "Unavailable"}
										</Typography>
										<Typography variant="body2" color="text.secondary">
											Latest segment: {state.data.mediaInfo?.latestSegment?.filename || "Unavailable"}
										</Typography>
										{state.data.endedAt ? (
											<Typography variant="body2" color="text.secondary">
												Ended: {formatDateTime(state.data.endedAt)}
											</Typography>
										) : null}
									</Stack>
								</Paper>
							</>
						) : null}
					</Stack>
				</Box>
			</Stack>
		</Box>
	);
}

export default LiveSharePage;
