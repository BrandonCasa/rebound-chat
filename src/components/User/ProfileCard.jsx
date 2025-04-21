import React, { useState, useEffect, useMemo, useRef } from "react";
import * as Icons from "@mui/icons-material";
import { Avatar, Box, Button, ButtonGroup, IconButton, Paper, Stack, TextField, Typography } from "@mui/material";
import axios from "axios";
import { useSelector, useDispatch } from "react-redux";

import socketIoHelper from "helpers/socket";
import { addSnackbar } from "slices/snackbarSlice";
import { setLoggedIn } from "slices/authSlice";

/* -------------------------------------------------- */
/*  Constants & small helpers                          */
/* -------------------------------------------------- */
const REQUEST_BASE = process.env.NODE_ENV === "development" ? "http://localhost:6001/api" : window.isElectron ? "https://rebound.nexus/api" : "/api";

const API_BASE = `${REQUEST_BASE}/users`;
const fullUrl = (u) => (u ? (u.startsWith("http") ? u : REQUEST_BASE + u) : null);
const cache = (u) => (u ? `${u}?t=${Date.now()}` : null);

function useFilePreview(initial) {
	const [file, setFile] = useState(null);
	const [preview, setPrev] = useState(cache(initial));

	const onChange = (e) => {
		const f = e.target.files?.[0];
		if (!f) return;
		setFile(f);
		setPrev(URL.createObjectURL(f));
	};

	const reset = (url) => {
		setFile(null);
		setPrev(cache(url));
	};

	return { file, preview, onChange, reset };
}

const CameraInput = ({ onChange, sx }) => (
	<IconButton component="label" sx={sx} size="small">
		<input hidden type="file" accept="image/*" onChange={onChange} />
		<Icons.CameraAlt fontSize="small" />
	</IconButton>
);

function FriendButtons({ status, friendId, profile, onAction }) {
	switch (status) {
		case "none":
			return (
				<Button
					fullWidth
					size="small"
					variant="contained"
					color="secondary"
					startIcon={<Icons.PersonAdd />}
					onClick={() => onAction("addfriend", { recipientId: profile.id }, `Sent request to ${profile.displayName}`)}
				>
					Add
				</Button>
			);
		case "sent":
			return (
				<Button
					fullWidth
					size="small"
					variant="outlined"
					color="info"
					startIcon={<Icons.PersonOff />}
					onClick={() => onAction("cancelfriend", { friendId }, `Canceled request to ${profile.displayName}`, "info")}
				>
					Cancel
				</Button>
			);
		case "received":
			return (
				<ButtonGroup fullWidth size="small" variant="contained">
					<Button color="success" startIcon={<Icons.PersonAdd />} onClick={() => onAction("acceptfriend", { friendId }, `Accepted request from ${profile.displayName}`)}>
						Accept
					</Button>
					<Button color="error" startIcon={<Icons.PersonRemove />} onClick={() => onAction("declinefriend", { friendId }, `Declined request from ${profile.displayName}`, "warning")}>
						Decline
					</Button>
				</ButtonGroup>
			);
		case "friends":
			return (
				<Button
					fullWidth
					size="small"
					variant="contained"
					color="error"
					startIcon={<Icons.PersonRemove />}
					onClick={() => onAction("removefriend", { friendId }, `Removed ${profile.displayName} from friends`)}
				>
					Remove
				</Button>
			);
		default:
			return (
				<Button fullWidth size="small" variant="contained" disabled>
					---
				</Button>
			);
	}
}

/* -------------------------------------------------- */
/*  Main component                                    */
/* -------------------------------------------------- */
export default function ProfileCard({ user, self: forceSelf = false, type = "full", width = "auto", passStyle }) {
	const dispatch = useDispatch();
	const auth = useSelector((s) => s.auth);

	/* ----------  derived flags & core profile object  ---------- */
	const isSelf = forceSelf || user?.id === auth.userId;
	const rawData = isSelf ? auth : user;

	const [profile, setProfile] = useState(rawData);
	const [editMode, setEdit] = useState(false);
	const [name, setName] = useState(profile?.displayName || "");
	const [bio, setBio] = useState(profile?.bio || "");

	const banner = useFilePreview(profile?.bannerUrl);
	const avatar = useFilePreview(profile?.avatarUrl);

	/* ----------  resync local copies when store/user changes  --- */
	useEffect(() => {
		setProfile(rawData);
		setName(rawData?.displayName || "");
		setBio(rawData?.bio || "");
		banner.reset(rawData?.bannerUrl);
		avatar.reset(rawData?.avatarUrl);
	}, [rawData]);

	/* ----------  socket watch (live updates)  ------------------- */
	const socket = socketIoHelper.getSocket();
	const watchRef = useRef(null);
	const watchId = profile?.id; // always watch *shown* profile

	useEffect(() => {
		if (!socket?.connected || !watchId || editMode) return;

		// detach previous
		if (watchRef.current && watchRef.current !== watchId) {
			socket.emit("unwatch_user", watchRef.current);
		}

		// attach new
		if (watchRef.current !== watchId) {
			socket.emit("watch_user", watchId);
			watchRef.current = watchId;
		}

		const handle = ([id, data]) => {
			if (id !== watchId) return;
			const av = data.avatarUrl ? REQUEST_BASE + data.avatarUrl : null;
			const bn = data.bannerUrl ? REQUEST_BASE + data.bannerUrl : null;

			setProfile((p) => ({ ...p, ...data, avatarUrl: av, bannerUrl: bn }));
			avatar.reset(av);
			banner.reset(bn);
			setName(data.displayName);
			setBio(data.bio);
		};

		socket.on("watched_user_saved", handle);
		return () => {
			socket.off("watched_user_saved", handle);
			if (watchRef.current) socket.emit("unwatch_user", watchRef.current);
			watchRef.current = null;
		};
	}, [socket, watchId, editMode, avatar, banner]);

	/* ----------  friend relation state  ------------------------ */
	const { status, friendId } = useMemo(() => {
		if (isSelf) return { status: "self", friendId: null };

		const rel = profile?.friends?.find((f) => f.requester === auth.userId || f.recipient === auth.userId);
		if (!rel) return { status: "none", friendId: null };
		if (rel.confirmed) return { status: "friends", friendId: rel._id };
		return rel.requester === auth.userId ? { status: "sent", friendId: rel._id } : { status: "received", friendId: rel._id };
	}, [profile?.friends, isSelf, auth.userId]);

	/* ----------  server helpers  -------------------------------- */
	const callApi = (ep, data, msg, sev = "success") =>
		axios
			.put(`${API_BASE}/${ep}`, data, {
				headers: { Authorization: `Bearer ${auth.authToken}` },
			})
			.then(() => dispatch(addSnackbar({ snackbarMsg: msg, snackbarSeverity: sev, autoHideDuration: 1500 })))
			.catch((err) => {
				console.error(err);
				dispatch(addSnackbar({ snackbarMsg: "Error", snackbarSeverity: "error", autoHideDuration: 1500 }));
			});

	const saveProfile = () => {
		const fd = new FormData();
		fd.append("displayName", name);
		fd.append("bio", bio);
		if (banner.file) fd.append("banner", banner.file);
		if (avatar.file) fd.append("avatar", avatar.file);

		axios
			.put(`${API_BASE}/modify`, fd, {
				headers: { Authorization: `Bearer ${auth.authToken}` },
			})
			.then(({ data }) => {
				const u = data.user;
				const full = { ...u, avatarUrl: fullUrl(u.avatarUrl), bannerUrl: fullUrl(u.bannerUrl) };
				dispatch(setLoggedIn({ avatarUrl: full.avatarUrl, bannerUrl: full.bannerUrl, displayName: full.displayName, username: full.username, bio: full.bio }));
				setProfile((p) => ({ ...p, ...full }));
				dispatch(addSnackbar({ snackbarMsg: "Profile updated", snackbarSeverity: "success", autoHideDuration: 1500 }));
				setEdit(false);
				avatar.reset(full.avatarUrl);
				banner.reset(full.bannerUrl);
			})
			.catch((err) => {
				console.error(err);
				dispatch(addSnackbar({ snackbarMsg: "Update failed", snackbarSeverity: "error", autoHideDuration: 1500 }));
			});
	};

	/* ----------  early outs / alt modes  ----------------------- */
	if (!profile && type !== "mini") return <Paper sx={{ width, height: passStyle?.maxHeight }} />;

	if (type === "mini") return <Paper>mini</Paper>; // TODO
	if (type === "popout") return <Paper>popout</Paper>; // TODO

	/* ----------  render  --------------------------------------- */
	return (
		<Paper
			sx={{
				width,
				maxHeight: "100%",
				display: "flex",
				flexDirection: "column",
				overflow: "hidden",
				...passStyle,
			}}
			elevation={3}
		>
			<Stack spacing={1} sx={{ p: 1, flex: 1 }}>
				{/* banner */}
				<Box position="relative">
					<Box
						component="img"
						src={banner.preview || (window.isElectron ? "banner.webp" : "/banner.webp")}
						alt="banner"
						sx={{ width: "100%", height: 120, borderRadius: 1, objectFit: "cover" }}
						key={banner.preview}
					/>
					{isSelf && editMode && <CameraInput onChange={banner.onChange} sx={{ position: "absolute", top: 8, right: 8, bgcolor: "rgba(255,255,255,0.7)" }} />}
				</Box>

				{/* avatar + name */}
				<Stack direction="row" spacing={2} alignItems="center">
					<Box position="relative">
						<Avatar src={avatar.preview || (window.isElectron ? "defaultpfp.webp" : "/defaultpfp.webp")} sx={{ width: 56, height: 56 }} />
						{isSelf && editMode && <CameraInput onChange={avatar.onChange} sx={{ position: "absolute", bottom: -4, right: -4, bgcolor: "white" }} />}
					</Box>
					<Box flex={1} minWidth={0}>
						{editMode ? (
							<TextField fullWidth size="small" label="Display Name" value={name} onChange={(e) => setName(e.target.value)} />
						) : (
							<Typography variant="h6" noWrap>
								{profile.displayName}
							</Typography>
						)}
						<Typography variant="body2" color="text.secondary">
							{profile.username}
						</Typography>
					</Box>
				</Stack>

				{/* bio */}
				<Paper variant="outlined" sx={{ p: 1, flex: 1, minHeight: 80 }}>
					<Typography variant="subtitle2">About Me</Typography>
					{editMode ? (
						<TextField fullWidth multiline rows={4} label="Bio" value={bio} onChange={(e) => setBio(e.target.value)} />
					) : (
						<Typography variant="body2" color="text.secondary">
							{profile.bio || "This user hasn’t written a bio yet."}
						</Typography>
					)}
				</Paper>

				{/* actions */}
				<Box sx={{ pt: 1 }}>
					{isSelf ? (
						editMode ? (
							<Stack direction="row" spacing={1}>
								<Button fullWidth variant="contained" size="small" onClick={saveProfile}>
									Save
								</Button>
								<Button fullWidth variant="outlined" size="small" onClick={() => setEdit(false)}>
									Cancel
								</Button>
							</Stack>
						) : (
							<Button fullWidth variant="contained" size="small" onClick={() => setEdit(true)}>
								Edit Profile
							</Button>
						)
					) : (
						<FriendButtons status={status} friendId={friendId} profile={profile} onAction={callApi} />
					)}
				</Box>
			</Stack>
		</Paper>
	);
}
