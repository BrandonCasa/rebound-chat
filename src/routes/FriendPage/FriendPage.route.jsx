// src/pages/FriendsPage.jsx
import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import { useSelector, useDispatch } from "react-redux";
import { useNavigate } from "react-router-dom";
import socketIoHelper from "../../helpers/socket";
import { Box, Paper, Avatar, Typography, Button, Stack, Tooltip, Popover } from "@mui/material";
import ChatIcon from "@mui/icons-material/Chat";
import PersonRemoveIcon from "@mui/icons-material/PersonRemove";
import CancelIcon from "@mui/icons-material/Cancel";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import HighlightOffIcon from "@mui/icons-material/HighlightOff";
import ProfileCard from "../../components/User/ProfileCard";
import { setSocketRoom } from "../../slices/authSlice";

// API base configuration
const REQUEST_BASE = process.env.NODE_ENV === "development" ? "http://localhost:6001/api" : globalThis.IN_ELECTRON_ENV ? "https://rebound.nexus/api" : "/api";
const API_BASE = `${REQUEST_BASE}/users`;

// append timestamp and remove old
const cache = (u) => {
	if (!u) return null;
	const cleaned = u.replace(/([?&])t=\d+(&)?/, (_, sep, trailing) => (trailing ? sep : ""));
	return `${cleaned}${cleaned.includes("?") ? "&" : "?"}t=${Date.now()}`;
};

// fetch complete profile for a given user id
async function getUserInfo(userId, authToken) {
	const url = `${REQUEST_BASE}/users/profile`;
	try {
		const { data } = await axios.get(url, {
			headers: {
				"Content-Type": "application/json",
				"Allow-Control-Allow-Origin": "*",
				Authorization: `Bearer ${authToken}`,
			},
			params: { id: userId },
		});
		const u = data.user;
		return {
			...u,
			avatarUrl: u.avatarUrl ? cache(REQUEST_BASE + u.avatarUrl) : null,
			bannerUrl: u.bannerUrl ? cache(REQUEST_BASE + u.bannerUrl) : null,
		};
	} catch (err) {
		console.error(err);
		return null;
	}
}

export default function FriendsPage() {
	const dispatch = useDispatch();
	const navigate = useNavigate();
	const auth = useSelector((state) => state.auth);
	const [friendItems, setFriendItems] = useState([]);
	const [loading, setLoading] = useState(true);

	// profile preview popover state
	const paperRefs = useRef({});
	const [userPreviewEl, setUserPreviewEl] = useState(null);
	const [userPreviewUser, setUserPreviewUser] = useState(null);

	// Close preview if anchor node is removed (e.g., after unfriending)
	useEffect(() => {
		if (userPreviewEl && !document.body.contains(userPreviewEl)) {
			setUserPreviewEl(null);
			setUserPreviewUser(null);
		}
	}, [friendItems, userPreviewEl]);

	// preview handler
	// preview handler: look up the ref by relationId
	const handleProfilePreview = async (userId, relationId) => {
		if (!userId) return;
		const info = await getUserInfo(userId, auth.authToken);
		if (info && paperRefs.current[relationId]) {
			setUserPreviewEl(paperRefs.current[relationId]);
			setUserPreviewUser(info);
		}
	};

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
				const res = await axios.get(`${API_BASE}/profile`, {
					headers: { Authorization: `Bearer ${auth.authToken}` },
				});
				const relations = res.data.user.friends;
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

		loadRelations();
		if (socket) {
			socket.emit("watch_user", auth.userId);
			socket.on("watched_user_saved", ([watchedId]) => {
				if (watchedId === auth.userId) loadRelations();
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
		navigate("/chat");
	};

	// Unified API caller that also closes any open profile popover
	const callApi = async (ep, data, onSuccessId) => {
		try {
			await axios.put(`${API_BASE}/${ep}`, data, {
				headers: { Authorization: `Bearer ${auth.authToken}` },
			});
			setFriendItems((prev) => prev.filter((item) => item.relation._id !== onSuccessId));
			setUserPreviewEl(null);
			setUserPreviewUser(null);
		} catch (err) {
			console.error(`${ep} failed`, err);
		}
	};

	if (!auth.loggedIn) return <Typography>Please login.</Typography>;
	if (loading) return <Typography>Loading friends...</Typography>;
	if (!friendItems.length) return <Typography>No friends or pending requests.</Typography>;

	return (
		<Box
			sx={{
				display: "flex",
				flexDirection: { xs: "column", sm: "row" },
				justifyContent: "flex-start",
				overflow: "auto",
				flexGrow: 1,
			}}
		>
			<Popover
				anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
				transformOrigin={{ vertical: "top", horizontal: "center" }}
				anchorEl={userPreviewEl}
				open={Boolean(userPreviewEl)}
				onClose={() => {
					setUserPreviewEl(null);
					setUserPreviewUser(null);
				}}
				sx={{ mb: 2 }}
			>
				<ProfileCard self={auth.userId === userPreviewUser?.id} user={userPreviewUser} width="300px" passStyle={{ maxWidth: "300px" }} />
			</Popover>

			<Stack spacing={2} sx={{ width: "100%", maxWidth: { xs: "100%", sm: 500 }, p: 0 }}>
				{friendItems.map(({ relation, profile, status }) => {
					if (!paperRefs.current[relation._id]) paperRefs.current[relation._id] = null;
					return (
						<Paper
							ref={(el) => (paperRefs.current[relation._id] = el)}
							key={relation._id}
							sx={{
								p: 2,
								display: "flex",
								justifyContent: "space-between",
								flexDirection: { xs: "column", sm: "row" },
								alignItems: "center",
								transition: "box-shadow .3s",
								"&:hover": { boxShadow: 6 },
								border: status === "friends" ? "none" : 2,
								borderColor: status === "sent" ? "info.main" : status === "received" ? "warning.main" : "grey.300",
								gap: 1,
							}}
							elevation={2}
							onClick={() => handleProfilePreview(profile.id, relation._id)}
						>
							<Box sx={{ flexDirection: "row", display: "flex", flexGrow: 1 }} style={{ cursor: "pointer" }}>
								<Avatar src={profile.avatarUrl || (window.isElectron ? "defaultpfp.webp" : "/defaultpfp.webp")} sx={{ width: { xs: 40, sm: 56 }, height: { xs: 40, sm: 56 }, mb: 0, mr: 2 }} />
								<Box flex={1} minWidth={0} sx={{ mr: { sm: 2 } }}>
									<Typography variant="h6" noWrap>
										{profile.displayName}
									</Typography>
									<Typography variant="body2" color="text.secondary" noWrap>
										@{profile.username}
									</Typography>
								</Box>
							</Box>
							<Stack direction="row" spacing={1} flexWrap="wrap">
								{status === "friends" && (
									<>
										<Tooltip title="Start Chat">
											<Button startIcon={<ChatIcon />} variant="contained" color="info" size="small" onClick={() => handleChat(profile.id)}>
												Chat
											</Button>
										</Tooltip>
										<Tooltip title="Remove Friend">
											<Button startIcon={<PersonRemoveIcon />} variant="outlined" color="error" size="small" onClick={() => callApi("removefriend", { friendId: relation._id }, relation._id)}>
												Remove
											</Button>
										</Tooltip>
									</>
								)}
								{status === "sent" && (
									<Tooltip title="Cancel Request">
										<Button startIcon={<CancelIcon />} variant="outlined" color="warning" size="small" onClick={() => callApi("cancelfriend", { friendId: relation._id }, relation._id)}>
											Cancel
										</Button>
									</Tooltip>
								)}
								{status === "received" && (
									<>
										<Tooltip title="Accept Request">
											<Button startIcon={<CheckCircleIcon />} variant="contained" color="success" size="small" onClick={() => callApi("acceptfriend", { friendId: relation._id }, relation._id)}>
												Accept
											</Button>
										</Tooltip>
										<Tooltip title="Decline Request">
											<Button startIcon={<HighlightOffIcon />} variant="outlined" color="error" size="small" onClick={() => callApi("declinefriend", { friendId: relation._id }, relation._id)}>
												Decline
											</Button>
										</Tooltip>
									</>
								)}
							</Stack>
						</Paper>
					);
				})}
			</Stack>
		</Box>
	);
}
