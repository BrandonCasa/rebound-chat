// src/pages/ChatPage.jsx
import React, { useState, useEffect } from "react";
import * as Icons from "@mui/icons-material";
import { Box, Button, Divider, Paper, Popover, Typography, useTheme } from "@mui/material";
import axios from "axios";
import { useDispatch, useSelector } from "react-redux";

import ChatRoomMenu from "components/Chat/ChatRoomMenu";
import UserListMenu from "components/Chat/UserListMenu";
import ChatArea from "components/Chat/ChatArea";
import ChatInput from "components/Chat/ChatInput";
import ProfileCard from "components/User/ProfileCard";

import socketIoHelper from "helpers/socket";
import { setSocketRoom } from "slices/authSlice";
import { addSnackbar } from "slices/snackbarSlice";

/* -------------------------------------------------- */
/*  Constants & helpers                               */
/* -------------------------------------------------- */
const REQUEST_BASE = process.env.NODE_ENV === "development" ? `http://localhost:6001/api` : globalThis.IN_ELECTRON_ENV ? `https://rebound.nexus/api` : "/api";

// ensure a URL is absolute (API returns `/uploads/…`)
const fullUrl = (u) => (u ? (u.startsWith("http") ? u : REQUEST_BASE + u) : null);

// cache‑bust so new images show up instantly
const cache = (u) => (u ? `${fullUrl(u)}?t=${Date.now()}` : null);

/* fetch complete profile for a given user id */
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
			avatarUrl: cache(u.avatarUrl),
			bannerUrl: cache(u.bannerUrl),
		};
	} catch (err) {
		console.error(err);
		return null;
	}
}

/* -------------------------------------------------- */
/*  Main component                                   */
/* -------------------------------------------------- */
function ChatPage() {
	/* ----- global & theme ----- */
	const authState = useSelector((state) => state.auth);
	const dispatch = useDispatch();
	const theme = useTheme();

	/* ----- local UI state ---- */
	const [message, setMessage] = useState("");
	const [messages, setMessages] = useState([]);
	const [channels, setChannels] = useState({});
	const [users, setUsers] = useState([]);

	/* menus & preview popovers */
	const [roomAnchorEl, setRoomAnchorEl] = useState(null);
	const [userListAnchorEl, setUserListAnchorEl] = useState(null);
	const [userPreviewEl, setUserPreviewEl] = useState(null);
	const [userPreviewUser, setUserPreviewUser] = useState(null);

	/* -------------------------------------------------- */
	/*  Socket lifecycle                                  */
	/* -------------------------------------------------- */
	// grab the current socket instance once per render
	const socket = socketIoHelper.getSocket();

	useEffect(() => {
		if (authState.loggedIn && socket) {
			// rooms
			socket.on("room_list", ([idMap, roomObjs]) => {
				setChannels(roomObjs);
				if (!authState.socketInfo.currentRoom) {
					dispatch(
						setSocketRoom({
							lastRoom: null,
							currentRoom: Object.keys(idMap)[0] || null,
						})
					);
				}
			});
			// messages
			socket.on("joined_room", (_id, msgs) => setMessages(msgs));
			socket.on("message_sent", (_id, msgs) => setMessages(msgs));
			socket.on("new_message", (_id, msgs) => setMessages(msgs));
			// presence
			socket.on("user_list", (_roomId, list, sender, evt) => {
				if (sender.id !== authState.userId) {
					dispatch(
						addSnackbar({
							snackbarMsg: `'${sender.displayName}' ${evt === "join" ? "joined!" : "left."}`,
							snackbarSeverity: "info",
							autoHideDuration: 1500,
						})
					);
				}
				setUsers(list);
			});
			// initial pull (buffered until actually connected)
			socket.emit("list_rooms");
		} else if (!authState.loggingIn && !authState.loggedIn) {
			// only warn if truly not logged in
			dispatch(
				addSnackbar({
					snackbarMsg: "Login or register to use this page.",
					snackbarSeverity: "warning",
					autoHideDuration: 1500,
				})
			);
		}

		return () => {
			if (socket) {
				socket.off("room_list");
				socket.off("joined_room");
				socket.off("message_sent");
				socket.off("new_message");
				socket.off("user_list");
			}
			setChannels({});
			setMessages([]);
			setUsers([]);
		};
		// now re-run this effect not just on auth flags, but also as soon as the socket object changes
	}, [authState.loggedIn, authState.loggingIn, authState.socketInfo.currentRoom, authState.userId, socket, dispatch]);

	/* Clear user list when switching rooms */
	useEffect(() => {
		setUsers([]);
	}, [authState.socketInfo.currentRoom]);

	/* Reset currentRoom on unmount */
	useEffect(
		() => () => {
			dispatch(setSocketRoom({ currentRoom: null }));
		},
		[dispatch]
	);

	/* -------------------------------------------------- */
	/*  Handlers                                          */
	/* -------------------------------------------------- */
	const sendMessage = (e) => {
		e?.preventDefault();

		if (!message || !authState.socketInfo.currentRoom) return;

		const socket = socketIoHelper.getSocket();
		socket.emit("message_room", [authState.socketInfo.currentRoom, message]);
		setMessage("");
	};

	const clickRoomSelect = (e) => {
		setRoomAnchorEl(e.currentTarget);
		setUserListAnchorEl(null);
	};

	const clickUserList = (e) => {
		setUserListAnchorEl(e.currentTarget);
		setRoomAnchorEl(null);
	};

	const previewUser = async (elRef, u) => {
		if (!elRef?.current) {
			setUserPreviewEl(null);
			setUserPreviewUser(null);
			return;
		}

		if (!u?._id) return;

		const info = await getUserInfo(u._id, authState.authToken);
		if (info) {
			setUserPreviewEl(elRef.current);
			setUserPreviewUser(info);
		}
	};

	/* -------------------------------------------------- */
	/*  Render                                            */
	/* -------------------------------------------------- */
	return (
		<Box
			sx={{
				display: "flex",
				flexGrow: 1,
				flexDirection: "column",
				justifyContent: "center",
				overflow: "hidden",
			}}
		>
			{/* user preview popover */}
			<Popover
				anchorOrigin={{ vertical: "top", horizontal: "right" }}
				transformOrigin={{ vertical: "bottom", horizontal: "left" }}
				anchorEl={userPreviewEl}
				open={Boolean(userPreviewEl)}
				onClose={() => {
					setUserPreviewEl(null);
					setUserPreviewUser(null);
				}}
				sx={{ mb: 2 }}
			>
				<ProfileCard self={authState.userId === userPreviewUser?.id} user={userPreviewUser} width="300px" passStyle={{ maxWidth: "300px" }} />
			</Popover>

			{/* menus */}
			<ChatRoomMenu anchorEl={roomAnchorEl} setAnchorEl={setRoomAnchorEl} channels={channels} setMessages={setMessages} />
			<UserListMenu anchorEl={userListAnchorEl} setAnchorEl={setUserListAnchorEl} users={users} />

			{/* shell */}
			<Paper
				sx={{
					position: "relative",
					display: "flex",
					flexDirection: "column",
					width: "100%",
					flexGrow: 1,
					height: "100%",
				}}
			>
				{/* header */}
				<Box
					sx={{
						display: "flex",
						alignItems: "center",
						p: 1,
						height: `calc(56px * ${theme.spacingMult(2)})`,
					}}
				>
					<Button variant="outlined" color="secondary" startIcon={<Icons.MenuRounded />} onClick={clickRoomSelect} sx={{ textTransform: "initial" }}>
						<Typography variant="h6" align="center">
							{channels[authState.socketInfo.currentRoom]?.name || "No Room"}
						</Typography>
					</Button>
					<Box flexGrow={1} />
					<Button variant="outlined" color="secondary" endIcon={<Icons.PeopleRounded />} onClick={clickUserList} sx={{ textTransform: "initial" }}>
						<Typography variant="h6" align="center">
							{users.length}
						</Typography>
					</Button>
				</Box>

				<Divider />

				{/* messages */}
				<Box sx={{ flexGrow: 1, position: "relative", width: "100%" }}>
					<ChatArea messages={messages} previewUser={previewUser} />
				</Box>

				{/* input */}
				<ChatInput message={message} setMessage={setMessage} sendMessage={sendMessage} />
			</Paper>
		</Box>
	);
}

export default React.memo(ChatPage);
