import * as Icons from "@mui/icons-material";
import { Avatar, Box, Button, ButtonGroup, Chip, Paper, Stack, Typography } from "@mui/material";
import axios from "axios";
import React, { useState, useEffect, useMemo, useRef } from "react";
import { useSelector, useDispatch } from "react-redux";

import socketIoHelper from "helpers/socket";
import { addSnackbar } from "slices/snackbarSlice";

// ------------------------------------------------------------
// ENV HELPERS
// ------------------------------------------------------------
const isElectron = typeof window !== "undefined" && window.process?.versions?.electron;

const API_BASE = process.env.NODE_ENV === "development" ? "http://localhost:6001/api/users" : isElectron ? "https://rebound.nexus/api/users" : "/api/users";

// ------------------------------------------------------------
// FULL PROFILE
// ------------------------------------------------------------
function FullProfile({ user, self, width = "auto", passStyle }) {
	const dispatch = useDispatch();
	const authState = useSelector((s) => s.auth);

	/** ---- local mirror of the incoming `user` prop ---- */
	const [profile, setProfile] = useState(user); // initial
	useEffect(() => setProfile(user || null), [user]); // keep in‑sync

	/** ---- socket watcher wiring ---- */
	const socket = socketIoHelper.getSocket();
	const prevIdRef = useRef();
	const watchedId = self ? authState.userId : user?.id; // might be undefined

	useEffect(() => {
		if (!socket?.connected) return;

		// (1) stop watching the previous id when either: component unmounts OR watchedId changes
		if (prevIdRef.current && prevIdRef.current !== watchedId) socket.emit("unwatch_user", prevIdRef.current);

		// (2) start watching the new id (if present)
		if (watchedId && prevIdRef.current !== watchedId) {
			socket.emit("watch_user", watchedId);
			prevIdRef.current = watchedId;
		}

		// (3) handle pushes
		const handle = ([id, data]) => id === watchedId && setProfile(data);
		socket.on("watched_user_saved", handle);

		// (4) cleanup on unmount or dependency change
		return () => {
			if (watchedId) socket.emit("unwatch_user", watchedId);
			socket.off("watched_user_saved", handle);
			prevIdRef.current = undefined;
		};
	}, [socket, watchedId]);

	/** ---- friend‑relation memo ---- */
	const { status, friendId } = useMemo(() => {
		// If the viewer is looking at their own profile, no buttons at all
		if (profile?.id === authState.userId) {
			return { status: "self", friendId: "" };
		}

		const rel = profile?.friends?.find(
			(f) =>
				f.requester === authState.userId || // I sent something
				f.recipient === authState.userId // I received something
		);

		if (!rel) return { status: "none", friendId: "" };

		if (rel.confirmed) return { status: "friends", friendId: rel._id };

		// pending but not confirmed
		return rel.requester === authState.userId
			? { status: "sent", friendId: rel._id } // I sent it  → Cancel
			: { status: "received", friendId: rel._id }; // I got it  → Accept/Decline
	}, [profile?.friends, profile?.id, authState.userId]);

	/** ---- generic REST helper ---- */
	const handleAction = (endpoint, payload, message, severity = "success") => {
		axios
			.put(`${API_BASE}/${endpoint}`, payload, {
				headers: { authorization: `Bearer ${authState.authToken}` },
			})
			.then(() =>
				dispatch(
					addSnackbar({
						snackbarMsg: message,
						snackbarSeverity: severity,
						autoHideDuration: 3000,
					})
				)
			)
			.catch(console.error);
	};

	/* ---------------- render states ---------------- */
	if (!profile) {
		// user was reset to null → show nothing but preserve box sizing
		return (
			<Paper
				sx={{
					width,
					height: passStyle?.maxHeight,
					maxHeight: "100%",
					boxSizing: "border-box",
				}}
				elevation={3}
			/>
		);
	}

	const { _id, displayName, username, bio } = profile;

	return (
		<Paper
			sx={{
				width,
				height: passStyle?.maxHeight || "auto",
				maxHeight: "100%",
				display: "flex",
				flexDirection: "column",
				overflow: "hidden",
				boxSizing: "border-box",
			}}
			elevation={3}
		>
			{/* ---- BANNER + HEADER ---- */}
			<Stack spacing={1} sx={{ p: 1, flex: 1 }}>
				<Box
					component="img"
					src="banner.png"
					alt="banner"
					sx={{
						width: "100%",
						height: 120,
						borderRadius: 1,
						objectFit: "cover",
					}}
				/>
				<Stack direction="row" spacing={2} alignItems="center">
					<Avatar src="defaultpfp.png" alt="avatar" sx={{ width: 56, height: 56 }} />
					<Box>
						<Typography variant="h6">{displayName}</Typography>
						<Typography variant="body2" color="text.secondary">
							{username}
						</Typography>
					</Box>
					<Box sx={{ flexGrow: 1, textAlign: "right" }}>
						<Typography variant="subtitle2" color="text.secondary">
							Title
						</Typography>
					</Box>
				</Stack>

				{/* ---- BIO ---- */}
				<Paper variant="outlined" sx={{ p: 1, flex: 1 }}>
					<Typography variant="subtitle2">About Me:</Typography>
					<Typography variant="body2" color="text.secondary">
						{bio}
					</Typography>

					<Typography variant="subtitle2" sx={{ mt: 1 }}>
						Interests:
					</Typography>
					<Stack direction="row" spacing={1} sx={{ mt: 0.5, flexWrap: "wrap" }}>
						<Chip label="Overwatch" variant="outlined" size="small" />
						<Chip label="Programming" variant="outlined" size="small" />
						<Chip label="Coffee" variant="outlined" size="small" />
					</Stack>
				</Paper>

				{/* ---- ACTIONS ---- */}
				<Stack direction="row" spacing={1} sx={{ pt: 1 }} justifyContent="space-between">
					{status === "none" && (
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
					)}

					{status === "friends" && (
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
					)}

					{status === "sent" && (
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
					)}

					{status === "received" && (
						<ButtonGroup fullWidth size="small" variant="contained">
							<Button color="success" startIcon={<Icons.PersonAdd />} onClick={() => handleAction("acceptfriend", { friendId }, `Accepted friend request from '${profile.displayName}'.`)}>
								Accept
							</Button>
							<Button color="error" startIcon={<Icons.PersonRemove />} onClick={() => handleAction("declinefriend", { friendId }, `Declined friend request from '${profile.displayName}'.`, "warning")}>
								Decline
							</Button>
						</ButtonGroup>
					)}

					{/* Reserve space / future block button */}
					{status !== "self" && (
						<Button fullWidth size="small" variant="contained" disabled>
							Block
						</Button>
					)}
				</Stack>
			</Stack>
		</Paper>
	);
}

// ------------------------------------------------------------
// POP‑OUT & MINI VARIANTS (unchanged)
// ------------------------------------------------------------
const PopoutProfile = ({ width = "auto" }) => (
	<Paper sx={{ width, height: width ? `calc(${width} * 1.6667)` : "auto", p: 1 }} elevation={3}>
		xd2
	</Paper>
);

const MiniProfile = ({ width = "auto" }) => (
	<Paper sx={{ width, height: width ? `calc(${width} / 4)` : "auto", p: 1 }} elevation={3}>
		xd3
	</Paper>
);

// ------------------------------------------------------------
// EXPORT
// ------------------------------------------------------------
export default function ProfileCard(props) {
	switch (props.type) {
		case "popout":
			return <PopoutProfile width={props.width} />;
		case "mini":
			return <MiniProfile width={props.width} />;
		default:
			return <FullProfile {...props} />;
	}
}
