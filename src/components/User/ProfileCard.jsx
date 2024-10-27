// Imports
import { Avatar, Box, Button, ButtonGroup, Chip, CircularProgress, Divider, Paper, Stack, Typography } from "@mui/material";
import { styled, useTheme } from "@mui/material/styles";
import Grid from "@mui/material/Unstable_Grid2";
import React, { useContext, useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import * as Icons from "@mui/icons-material";
import axios from "axios";
import { setLoggedIn } from "slices/authSlice";
import socketIoHelper from "helpers/socket";
import { addSnackbar } from "slices/snackbarSlice";

function FullProfile(props) {
	let theme = useTheme();
	const authState = useSelector((state) => state.auth);
	const [userId, setUserId] = useState(null);
	const [displayName, setDisplayName] = useState("");
	const [username, setUsername] = useState("");
	const [bio, setBio] = useState("");
	const [isPending, setIsPending] = useState(false);
	const [isSender, setIsSender] = useState(false);
	const [isFriends, setIsFriends] = useState(false);
	const [friendId, setFriendId] = useState("");
	const dispatch = useDispatch();

	const updateDataOther = (data) => {
		setBio(data?.bio);
		setDisplayName(data?.displayName);
		setUsername(data?.username);
		setUserId(data?.id);
		setIsPending(false);
		setIsFriends(false);
		setFriendId("");
		setIsSender(false);

		if (!props?.self) {
			for (let friend in data.friends) {
				friend = data.friends[friend];
				if (friend.requester !== authState.userId && friend.recipient !== authState.userId) {
					continue;
				}
				setIsSender(friend.requester === authState.userId);
				setFriendId(friend._id);

				if (!friend.confirmed) {
					setIsPending(true);
					break;
				}
				setIsFriends(true);
			}
		}
	};

	function startListeningChanges(userIdIn) {
		if (socketIoHelper.getSocket() !== null && socketIoHelper.getSocket().connected) {
			const socketClient = socketIoHelper.getSocket();
			socketClient.on("watched_user_saved", ([watchedId, watchedData]) => {
				if (watchedId === userIdIn) {
					updateDataOther(watchedData);
				}
			});
		}
	}

	const stopListeningChanges = () => {
		if (socketIoHelper.getSocket() !== null && socketIoHelper.getSocket().connected) {
			const socketClient = socketIoHelper.getSocket();
			socketClient.off("watched_user_saved");
		}
	};

	useEffect(() => {
		if (socketIoHelper.getSocket() !== null && socketIoHelper.getSocket().connected) {
			const socketClient = socketIoHelper.getSocket();
			socketClient.emit("watch_user", props?.self ? authState.userId : props?.user.id);
			startListeningChanges(props?.self ? authState.userId : props?.user.id);
		}
		updateDataOther(props?.self ? { ...authState, id: authState.userId } : props?.user);

		return () => {
			setBio("");
			setDisplayName("");
			setUsername("");
			setUserId(null);
			setIsPending(false);
			setIsFriends(false);
			setFriendId("");
			setIsSender(false);
			stopListeningChanges();
		};
	}, [authState.loggedIn, authState.socketInfo.connected]);

	let cardWidth = props?.width || "auto";
	let cardHeight = props?.width || "auto";

	const sendFriendRequest = () => {
		if (userId !== authState.userId) {
			const requestString = process.env.NODE_ENV === "development" ? "http://localhost:6001/api/users/addfriend" : "/api/users/addfriend";
			axios
				.put(
					requestString,
					{ recipientId: userId },
					{
						headers: {
							"Content-Type": "application/json",
							"Allow-Control-Allow-Origin": "*",
							authorization: `Bearer ${authState.authToken}`,
						},
					}
				)
				.then((response) => {
					//setIsPending(true);
					//dispatch(setLoggedIn({ friends: [response?.data?.friendId, ...authState.friends] }));
					dispatch(addSnackbar({ snackbarMsg: `Sent friend request to '${displayName}'.`, snackbarSeverity: "success", autoHideDuration: 3000 }));
				})
				.catch((error) => {
					console.log(error);
				});
		}
	};

	const acceptFriendRequest = () => {
		if (isPending && !isFriends && userId !== authState.userId) {
			const requestString = process.env.NODE_ENV === "development" ? "http://localhost:6001/api/users/acceptfriend" : "/api/users/acceptfriend";
			axios
				.put(
					requestString,
					{ friendId: friendId },
					{
						headers: {
							"Content-Type": "application/json",
							"Allow-Control-Allow-Origin": "*",
							authorization: `Bearer ${authState.authToken}`,
						},
					}
				)
				.then((response) => {
					if (response.status === 200) {
						//setIsPending(false);
						//setIsFriends(true);
						dispatch(addSnackbar({ snackbarMsg: `Accepted friend request from '${displayName}'.`, snackbarSeverity: "success", autoHideDuration: 3000 }));
					}
				})
				.catch((error) => {
					console.log(error);
				});
		}
	};

	const declineFriendRequest = () => {
		if (isPending && !isFriends && userId !== authState.userId) {
			const requestString = process.env.NODE_ENV === "development" ? "http://localhost:6001/api/users/declinefriend" : "/api/users/declinefriend";
			axios
				.put(
					requestString,
					{ friendId: friendId },
					{
						headers: {
							"Content-Type": "application/json",
							"Allow-Control-Allow-Origin": "*",
							authorization: `Bearer ${authState.authToken}`,
						},
					}
				)
				.then((response) => {
					if (response.status === 200) {
						//setIsPending(false);
						//setIsFriends(false);
						dispatch(addSnackbar({ snackbarMsg: `Declined friend request from '${displayName}'.`, snackbarSeverity: "warning", autoHideDuration: 3000 }));
					}
				})
				.catch((error) => {
					console.log(error);
				});
		}
	};

	const cancelFriendRequest = () => {
		if (isPending && !isFriends && userId !== authState.userId) {
			const requestString = process.env.NODE_ENV === "development" ? "http://localhost:6001/api/users/cancelfriend" : "/api/users/cancelfriend";
			axios
				.put(
					requestString,
					{ friendId: friendId },
					{
						headers: {
							"Content-Type": "application/json",
							"Allow-Control-Allow-Origin": "*",
							authorization: `Bearer ${authState.authToken}`,
						},
					}
				)
				.then((response) => {
					if (response.status === 200) {
						//setIsPending(false);
						//setIsFriends(false);
						dispatch(addSnackbar({ snackbarMsg: `Canceled friend request to '${displayName}'.`, snackbarSeverity: "info", autoHideDuration: 3000 }));
					}
				})
				.catch((error) => {
					console.log(error);
				});
		}
	};

	const removeFriend = () => {
		if (!isPending && isFriends && userId !== authState.userId) {
			const requestString = process.env.NODE_ENV === "development" ? "http://localhost:6001/api/users/removefriend" : "/api/users/removefriend";
			axios
				.put(
					requestString,
					{ friendId: friendId },
					{
						headers: {
							"Content-Type": "application/json",
							"Allow-Control-Allow-Origin": "*",
							authorization: `Bearer ${authState.authToken}`,
						},
					}
				)
				.then((response) => {
					if (response.status === 200) {
						//setIsPending(false);
						//setIsFriends(false);
						dispatch(addSnackbar({ snackbarMsg: `Removed friend '${displayName}'.`, snackbarSeverity: "info", autoHideDuration: 3000 }));
					}
				})
				.catch((error) => {
					console.log(error);
				});
		}
	};

	if (userId === null) {
		return (
			<Paper
				sx={{ padding: 0, width: cardWidth, height: cardHeight, overflow: "hidden", display: "flex", flexDirection: "column", ...props?.passStyle }}
				elevation={3}
			>
				<CircularProgress size={96} sx={{ margin: "auto" }} />
			</Paper>
		);
	}

	return (
		<Paper
			sx={{ padding: 0, width: cardWidth, height: cardHeight, overflow: "hidden", display: "flex", flexDirection: "column", ...props?.passStyle }}
			elevation={3}
		>
			<Stack spacing={0.5} sx={{ flexGrow: 1, padding: theme.spacing(0.5) }}>
				<img style={{ borderRadius: theme.spacing(0.5) }} src="banner.png" alt="no_banner" />
				<Stack direction="row" spacing={2} sx={{ padding: theme.spacing(0.5) }}>
					<Avatar alt="User" src="defaultpfp.png" sx={{ width: "64px", height: "64px" }} />
					<Stack spacing={0} sx={{ padding: 0, height: "64px" }}>
						<Typography variant="h5" height={"32px"}>
							{displayName}
						</Typography>
						<Typography variant="subtitle2" height={"32px"} sx={{ color: `${theme.palette.text.secondary}` }}>
							{username}
						</Typography>
					</Stack>
					<Stack spacing={0} sx={{ padding: 0, height: "64px", flexGrow: 1, paddingRight: theme.spacing(0.5) }}>
						<Typography textAlign="end" variant="subtitle1" height={"32px"} sx={{ color: `${theme.palette.text.secondary}` }}>
							Title
						</Typography>
					</Stack>
				</Stack>
				<Paper sx={{ flexGrow: 1, borderWidth: "2px", padding: theme.spacing(0.5) }} variant="outlined">
					<Typography variant="subtitle1" sx={{ color: `${theme.palette.text.primary}` }}>
						About Me:
					</Typography>
					<Typography variant="subtitle2" sx={{ color: `${theme.palette.text.secondary}` }}>
						{bio}
					</Typography>
					<Typography variant="subtitle1" sx={{ color: `${theme.palette.text.primary}` }}>
						Interests:
					</Typography>
					<Stack direction="row" spacing={1}>
						<Chip label="Overwatch" variant="outlined" color="secondary" />
						<Chip label="Programming" variant="outlined" color="secondary" />
						<Chip label="Coffee" variant="outlined" color="secondary" />
					</Stack>
				</Paper>
				<Stack direction="row" justifyContent="space-between" spacing={1} sx={{ padding: theme.spacing(0.5) }}>
					{!isPending && !isFriends && (
						<Button variant="contained" color="secondary" disabled={userId === authState.userId} onClick={sendFriendRequest}>
							Add Friend
						</Button>
					)}
					{!isPending && isFriends && (
						<Button variant="contained" color="error" onClick={removeFriend}>
							Remove Friend
						</Button>
					)}
					{isPending && !isFriends && isSender && (
						<Button variant="outlined" color="info" onClick={cancelFriendRequest}>
							Cancel Friend Request
						</Button>
					)}
					{isPending && !isFriends && !isSender && (
						<ButtonGroup variant="contained">
							<Button color="success" onClick={acceptFriendRequest} startIcon={<Icons.PersonAddRounded />}>
								Accept
							</Button>
							<Button color="error" onClick={declineFriendRequest} startIcon={<Icons.PersonRemoveRounded />}>
								Decline
							</Button>
						</ButtonGroup>
					)}
					<Button variant="contained" color="primary" disabled={userId === authState.userId || true}>
						Block
					</Button>
				</Stack>
			</Stack>
		</Paper>
	);
}

function PopoutProfile(props) {
	let theme = useTheme();

	let cardWidth = props?.width || "auto";
	let cardHeight = props?.width ? `calc(${props.width} * 1.6667)` : "auto";

	return <Paper sx={{ padding: theme.spacing(1), width: cardWidth, height: cardHeight }}>xd2</Paper>;
}

function MiniProfile(props) {
	let theme = useTheme();

	let cardWidth = props?.width || "auto";
	let cardHeight = props?.width ? `calc(${props.width} / 4)` : "auto";

	return <Paper sx={{ padding: theme.spacing(1), width: cardWidth, height: cardHeight }}>xd3</Paper>;
}

function ProfileCard(props) {
	let theme = useTheme();

	if (props?.type === "full") {
		return <FullProfile {...props} />;
	}
	if (props?.type === "popout") {
		return <PopoutProfile {...props} />;
	}
	if (props?.type === "mini") {
		return <MiniProfile {...props} />;
	}
}

export default ProfileCard;
