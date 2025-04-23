// src/pages/FriendsPage.jsx
import React, { useState, useEffect } from "react";
import axios from "axios";
import { useSelector, useDispatch } from "react-redux";
import { useNavigate } from "react-router-dom";
import socketIoHelper from "helpers/socket";
import { Box, Paper, Avatar, Typography, Button, Stack } from "@mui/material";
import { setSocketRoom } from "slices/authSlice";

// API base configuration
const REQUEST_BASE = process.env.NODE_ENV === "development" ? "http://localhost:6001/api" : globalThis.IN_ELECTRON_ENV ? "https://rebound.nexus/api" : "/api";
const API_BASE = `${REQUEST_BASE}/users`;
const cache = (u) => {
	if (!u) return null;
	const cleaned = u.replace(/([?&])t=\d+(&)?/, (_, sep, trailing) => (trailing ? sep : ""));
	return `${cleaned}${cleaned.includes("?") ? "&" : "?"}t=${Date.now()}`;
};

export default function FriendsPage() {
	const dispatch = useDispatch();
	const navigate = useNavigate();
	const auth = useSelector((state) => state.auth);
	const [friendItems, setFriendItems] = useState([]);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		if (!auth.loggedIn) {
			setLoading(false);
			return;
		}
		let isMounted = true;
		const socket = socketIoHelper.getSocket();

		async function loadRelations() {
			setLoading(true);
			try {
				// 1) Fetch own profile (includes Friend docs)
				const res = await axios.get(`${API_BASE}/profile`, {
					headers: { Authorization: `Bearer ${auth.authToken}` },
				});
				const relations = res.data.user.friends;

				// 2) Map each relation to status, otherId, and profile
				const items = await Promise.all(
					relations.map(async (rel) => {
						const myId = auth.userId;
						let status, otherId;
						if (rel.confirmed) {
							status = "friends";
							otherId = rel.requester === myId ? rel.recipient : rel.requester;
						} else if (rel.requester === myId) {
							status = "sent";
							otherId = rel.recipient;
						} else {
							status = "received";
							otherId = rel.requester;
						}
						const profileRes = await axios.get(`${API_BASE}/profile`, {
							headers: { Authorization: `Bearer ${auth.authToken}` },
							params: { id: otherId },
						});
						return {
							relation: rel,
							profile: {
								...profileRes.data.user,
								avatarUrl: profileRes.data.user?.avatarUrl && profileRes.data.user.avatarUrl !== "" ? cache(REQUEST_BASE + profileRes.data.user.avatarUrl) : null,
								bannerUrl: profileRes.data.user?.bannerUrl && profileRes.data.user.bannerUrl !== "" ? cache(REQUEST_BASE + profileRes.data.user.bannerUrl) : null,
							},
							status,
						};
					})
				);

				if (isMounted) setFriendItems(items);
			} catch (err) {
				console.error("Error loading friend relations:", err);
			} finally {
				if (isMounted) setLoading(false);
			}
		}

		// initial load
		loadRelations();

		if (socket) {
			// tell server we want to watch changes on our own user
			socket.emit("watch_user", auth.userId);

			// when server notifies us that our profile (and thus our friends array) changed,
			// re-fetch the list
			socket.on("watched_user_saved", ([watchedId /*, publicInfo, privateInfo */]) => {
				if (watchedId === auth.userId) {
					loadRelations();
				}
			});
		}

		return () => {
			isMounted = false;
			if (socket) {
				socket.emit("unwatch_user", auth.userId);
				socket.off("watched_user_saved");
			}
		};
	}, [auth.authToken, auth.userId, auth.loggedIn]);

	const handleChat = (roomId) => {
		dispatch(setSocketRoom({ currentRoom: roomId }));
		navigate("/chat");
	};

	const callApi = async (ep, data, onSuccessId) => {
		try {
			await axios.put(`${API_BASE}/${ep}`, data, {
				headers: { Authorization: `Bearer ${auth.authToken}` },
			});
			setFriendItems((prev) => prev.filter((item) => item.relation._id !== onSuccessId));
		} catch (err) {
			console.error(`${ep} failed`, err);
		}
	};

	if (!auth.loggedIn) {
		return <Typography>Please login.</Typography>;
	}

	if (loading) {
		return <Typography>Loading friends...</Typography>;
	}

	if (!friendItems.length) {
		return <Typography>No friends or pending requests.</Typography>;
	}

	return (
		<Box sx={{ display: "flex", justifyContent: "start", flexGrow: 1, overflow: "auto" }}>
			<Stack spacing={2}>
				{friendItems.map(({ relation, profile, status }) => (
					<Paper
						key={relation._id}
						sx={{
							p: 2,
							display: "flex",
							alignItems: "center",
							border: status === "friends" ? "none" : 2,
							borderColor: status === "sent" ? "info.main" : status === "received" ? "warning.main" : "grey.300",
						}}
						elevation={2}
					>
						<Avatar src={profile.avatarUrl || (window.isElectron ? "defaultpfp.webp" : "/defaultpfp.webp")} sx={{ width: 56, height: 56, mr: 2 }} />
						<Box flex={1} minWidth={0} sx={{ mr: 2 }}>
							<Typography variant="h6" noWrap>
								{profile.displayName}
							</Typography>
							<Typography variant="body2" color="text.secondary" noWrap>
								@{profile.username}
							</Typography>
						</Box>
						<Stack direction="row" spacing={1}>
							{status === "friends" && (
								<>
									<Button variant="contained" size="small" onClick={() => handleChat(profile.id)}>
										Chat
									</Button>
									<Button variant="outlined" size="small" onClick={() => callApi("removefriend", { friendId: relation._id }, relation._id)}>
										Remove
									</Button>
								</>
							)}
							{status === "sent" && (
								<Button variant="outlined" size="small" onClick={() => callApi("cancelfriend", { friendId: relation._id }, relation._id)}>
									Cancel Request
								</Button>
							)}
							{status === "received" && (
								<>
									<Button variant="contained" size="small" onClick={() => callApi("acceptfriend", { friendId: relation._id }, relation._id)}>
										Accept
									</Button>
									<Button variant="outlined" size="small" onClick={() => callApi("declinefriend", { friendId: relation._id }, relation._id)}>
										Decline
									</Button>
								</>
							)}
						</Stack>
					</Paper>
				))}
			</Stack>
		</Box>
	);
}
