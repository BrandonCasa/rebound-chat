import * as Icons from "@mui/icons-material";
import { Avatar, Box, Button, ButtonGroup, Chip, IconButton, Paper, Stack, TextField, Typography } from "@mui/material";
import axios from "axios";
import React, { useState, useEffect, useMemo, useRef } from "react";
import { useSelector, useDispatch } from "react-redux";

import socketIoHelper from "helpers/socket";
import { addSnackbar } from "slices/snackbarSlice";

const isElectron = typeof window !== "undefined" && Boolean(window.process?.versions?.electron);
const API_BASE = process.env.NODE_ENV === "development" ? "http://localhost:6001/api/users" : isElectron ? "https://rebound.nexus/api/users" : "/api/users";

function FullProfile({ user, self, width = "auto", passStyle }) {
	const dispatch = useDispatch();
	const authState = useSelector((s) => s.auth);

	//–– profile state + edit state
	const [profile, setProfile] = useState(user);
	const [editMode, setEditMode] = useState(false);
	const [displayName, setDisplayName] = useState("");
	const [bio, setBio] = useState("");
	const [bannerFile, setBannerFile] = useState(null);
	const [avatarFile, setAvatarFile] = useState(null);
	const [bannerPreview, setBannerPreview] = useState(null);
	const [avatarPreview, setAvatarPreview] = useState(null);

	const bannerInputRef = useRef();
	const avatarInputRef = useRef();

	// sync profile → form fields
	useEffect(() => {
		const src = self ? authState : user;
		if (src) {
			setProfile(src);
			if (!editMode) {
				setDisplayName(src.displayName || "");
				setBio(src.bio || "");
				setBannerPreview(src.bannerUrl || "/banner.webp");
				setAvatarPreview(src.avatarUrl || "/defaultpfp.webp");
			}
		}
	}, [user, authState, self, editMode]);

	// socket watching (unchanged) …
	const socket = socketIoHelper.getSocket();
	const prevIdRef = useRef();
	let watchedId = self ? authState.userId : user?.id;

	useEffect(() => {
		if (!socket?.connected) return;
		if (prevIdRef.current && prevIdRef.current !== watchedId) socket.emit("unwatch_user", prevIdRef.current);
		if (watchedId && prevIdRef.current !== watchedId) {
			socket.emit("watch_user", watchedId);
			prevIdRef.current = watchedId;
		}
		const handle = ([id, data]) => id === watchedId && setProfile(data) && !editMode && setBio(data.bio);
		socket.on("watched_user_saved", handle);
		return () => {
			if (watchedId) socket.emit("unwatch_user", watchedId);
			socket.off("watched_user_saved", handle);
			prevIdRef.current = undefined;
		};
	}, [socket, watchedId, editMode]);

	// friend-status logic (unchanged) …
	const { status, friendId } = useMemo(() => {
		if (profile?.id === authState.userId) return { status: "self", friendId: "" };
		const rel = profile?.friends?.find((f) => f.requester === authState.userId || f.recipient === authState.userId);
		if (!rel) return { status: "none", friendId: "" };
		if (rel.confirmed) return { status: "friends", friendId: rel._id };
		return rel.requester === authState.userId ? { status: "sent", friendId: rel._id } : { status: "received", friendId: rel._id };
	}, [profile?.friends, profile?.id, authState.userId]);

	// generic REST helper
	const handleAction = (endpoint, payload, message, severity = "success") => {
		axios
			.put(`${API_BASE}/${endpoint}`, payload, {
				headers: { authorization: `Bearer ${authState.authToken}` },
			})
			.then(() => dispatch(addSnackbar({ snackbarMsg: message, snackbarSeverity: severity })))
			.catch(console.error);
	};

	// Save handler
	const handleSave = () => {
		const form = new FormData();
		form.append("displayName", displayName);
		form.append("bio", bio);
		if (bannerFile) form.append("banner", bannerFile);
		if (avatarFile) form.append("avatar", avatarFile);

		axios
			.put(`${API_BASE}/modify`, form, {
				headers: {
					authorization: `Bearer ${authState.authToken}`,
					"Content-Type": "multipart/form-data",
				},
			})
			.then((res) => {
				setProfile(res.data);
				dispatch(addSnackbar({ snackbarMsg: "Profile updated!" }));
				setEditMode(false);
			})
			.catch((err) => {
				console.error(err);
				dispatch(addSnackbar({ snackbarMsg: "Update failed", snackbarSeverity: "error" }));
			});
	};

	// File-change preview handlers
	const onBannerChange = (e) => {
		const file = e.target.files?.[0];
		if (file) {
			setBannerFile(file);
			setBannerPreview(URL.createObjectURL(file));
		}
	};
	const onAvatarChange = (e) => {
		const file = e.target.files?.[0];
		if (file) {
			setAvatarFile(file);
			setAvatarPreview(URL.createObjectURL(file));
		}
	};

	// if no profile yet, render placeholder
	if (!profile) {
		return (
			<Paper
				sx={{
					width,
					height: passStyle?.maxHeight,
					boxSizing: "border-box",
				}}
				elevation={3}
			/>
		);
	}

	const { displayName: dn, username, bio: bf } = profile;

	return (
		<Paper
			sx={{
				width,
				maxHeight: "100%",
				display: "flex",
				flexDirection: "column",
				overflow: "hidden",
				boxSizing: "border-box",
			}}
			elevation={3}
		>
			<Stack spacing={1} sx={{ p: 1, flex: 1 }}>
				{/* Banner + edit control */}
				<Box position="relative">
					<Box
						component="img"
						src={bannerPreview}
						alt="banner"
						sx={{
							width: "100%",
							height: 120,
							borderRadius: 1,
							objectFit: "cover",
						}}
					/>
					{self && editMode && (
						<IconButton component="label" sx={{ position: "absolute", top: 8, right: 8, bgcolor: "rgba(255,255,255,0.7)" }} size="small">
							<input hidden type="file" accept="image/*" onChange={onBannerChange} />
							<Icons.CameraAlt fontSize="small" />
						</IconButton>
					)}
				</Box>

				{/* Header: avatar + name */}
				<Stack direction="row" spacing={2} alignItems="center">
					<Box position="relative">
						<Avatar src={avatarPreview} sx={{ width: 56, height: 56 }} />
						{self && editMode && (
							<IconButton component="label" sx={{ position: "absolute", bottom: -4, right: -4, bgcolor: "white" }} size="small">
								<input hidden type="file" accept="image/*" onChange={onAvatarChange} />
								<Icons.CameraAlt fontSize="small" />
							</IconButton>
						)}
					</Box>
					<Box flex={1}>
						{editMode ? <TextField fullWidth label="Display Name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} /> : <Typography variant="h6">{dn}</Typography>}
						<Typography variant="body2" color="text.secondary">
							{username}
						</Typography>
					</Box>
				</Stack>

				{/* About me */}
				<Paper variant="outlined" sx={{ p: 1, flex: 1 }}>
					<Typography variant="subtitle2">About Me:</Typography>
					{editMode ? (
						<TextField fullWidth multiline rows={4} label="Bio" value={bio} onChange={(e) => setBio(e.target.value)} />
					) : (
						<Typography variant="body2" color="text.secondary">
							{bf}
						</Typography>
					)}
				</Paper>

				{/* Actions: Edit / Save / Cancel or Friend buttons */}
				<Box sx={{ pt: 1 }}>
					{self ? (
						editMode ? (
							<Stack direction="row" spacing={1}>
								<Button fullWidth size="small" variant="contained" onClick={handleSave}>
									Save
								</Button>
								<Button fullWidth size="small" variant="outlined" onClick={() => setEditMode(false)}>
									Cancel
								</Button>
							</Stack>
						) : (
							<Button fullWidth size="small" variant="contained" onClick={() => setEditMode(true)}>
								Edit Profile
							</Button>
						)
					) : (
						// …existing friend‑relation buttons based on `status`…
						<FriendButtons status={status} friendId={friendId} profile={profile} handleAction={handleAction} />
					)}
				</Box>
			</Stack>
		</Paper>
	);
}

// extract friend‑buttons into its own small component
function FriendButtons({ status, friendId, profile, handleAction }) {
	switch (status) {
		case "none":
			return (
				<Button
					fullWidth
					size="small"
					variant="contained"
					color="secondary"
					startIcon={<Icons.PersonAdd />}
					onClick={() => handleAction("addfriend", { recipientId: profile.id }, `Sent friend request to '${profile.displayName}'.`)}
				>
					Add
				</Button>
			);
		case "friends":
			return (
				<Button
					fullWidth
					size="small"
					variant="contained"
					color="error"
					startIcon={<Icons.PersonRemove />}
					onClick={() => handleAction("removefriend", { friendId }, `Removed friend '${profile.displayName}'.`)}
				>
					Remove
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
					onClick={() => handleAction("cancelfriend", { friendId }, `Canceled friend request to '${profile.displayName}'.`, "info")}
				>
					Cancel
				</Button>
			);
		case "received":
			return (
				<ButtonGroup fullWidth size="small" variant="contained">
					<Button color="success" startIcon={<Icons.PersonAdd />} onClick={() => handleAction("acceptfriend", { friendId }, `Accepted friend request from '${profile.displayName}'.`)}>
						Accept
					</Button>
					<Button color="error" startIcon={<Icons.PersonRemove />} onClick={() => handleAction("declinefriend", { friendId }, `Declined friend request from '${profile.displayName}'.`, "warning")}>
						Decline
					</Button>
				</ButtonGroup>
			);
		default:
			return (
				<Button fullWidth size="small" variant="contained" disabled>
					Block
				</Button>
			);
	}
}

export default function ProfileCard(props) {
	switch (props.type) {
		case "popout":
			// …unchanged…
			return <Paper>popout</Paper>;
		case "mini":
			return <Paper>mini</Paper>;
		default:
			return <FullProfile {...props} />;
	}
}
