import { useState, useEffect, useRef, useCallback } from "react";
import { useDispatch, useSelector } from "react-redux";

import { fetchRoomMessages, mapMessages } from "../../slices/chatApiSlice";
import { parseMentions } from "../../helpers/mentions";
import { fetchUserProfile } from "../../slices/userApiSlice";
import { addSnackbar } from "../../slices/snackbarSlice";
import { setActiveSocketRoom, emitSocketEvent } from "../../slices/socketSlice";
import { getSocketClient } from "../../helpers/socketClient";

const MESSAGE_PAGE_SIZE = 50;

export default function useChatPage() {
	const authState = useSelector((state) => state.auth);
	const sockets = useSelector((s) => s.sockets);
	const dispatch = useDispatch();

	const [message, setMessage] = useState("");
	const [messages, setMessages] = useState([]);
	const [channels, setChannels] = useState({});
	const [users, setUsers] = useState([]);

	const [roomAnchorEl, setRoomAnchorEl] = useState(null);
	const [userListAnchorEl, setUserListAnchorEl] = useState(null);
	const [userPreviewEl, setUserPreviewEl] = useState(null);
	const [userPreviewUser, setUserPreviewUser] = useState(null);
	const [msgMenuPos, setMsgMenuPos] = useState(null);
	const [selectedMessage, setSelectedMessage] = useState(null);
	const [editingMessageId, setEditingMessageId] = useState(null);
	const [editingText, setEditingText] = useState("");
	const fetchingRef = useRef(false);
	const loadingOlderRef = useRef(false);

	const pageInfoRef = useRef({ hasMoreBefore: false, hasMoreAfter: false, nextBefore: null, nextAfter: null, channel: null });

	const mergeMessages = useCallback((existing, incoming) => {
		const merged = new Map();
		existing.forEach((msg) => merged.set(msg._id, msg));
		incoming.forEach((msg) => merged.set(msg._id, msg));
		const outMsgs = Array.from(merged.values()).sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

		return outMsgs;
	}, []);

	const updatePageInfo = useCallback((pageInfo = {}, roomIdOut = undefined, nextMessages = []) => {
		const resolvedChannelCandidate = roomIdOut ?? pageInfo.channel ?? nextMessages[0]?.roomId;
		const resolvedChannel = resolvedChannelCandidate ?? pageInfoRef.current.channel ?? null;

		pageInfoRef.current = {
			hasMoreBefore: pageInfo.hasMoreBefore ?? pageInfoRef.current.hasMoreBefore,
			hasMoreAfter: pageInfo.hasMoreAfter ?? pageInfoRef.current.hasMoreAfter,
			nextBefore: pageInfo.nextBefore ?? nextMessages[0]?._id ?? pageInfoRef.current.nextBefore,
			nextAfter: pageInfo.nextAfter ?? nextMessages[nextMessages.length - 1]?._id ?? pageInfoRef.current.nextAfter,
			channel: resolvedChannel,
		};
	}, []);

	const fetchMessages = useCallback(
		async (roomOverride) => {
			const requestedRoom = roomOverride || sockets.currentRoom || pageInfoRef.current.channel;
			let roomId = pageInfoRef.current.channel || roomOverride || sockets.currentRoom;
			if (!roomId) {
				console.error("Cannot fetch messages without an active channel");
				dispatch(
					addSnackbar({
						snackbarMsg: "Unable to load messages: no active channel.",
						snackbarSeverity: "error",
						autoHideDuration: 2500,
					})
				);
				return;
			}
			updatePageInfo(pageInfoRef.current, roomId);
			if (fetchingRef.current || !authState.authToken || !sockets.connected) return;
			fetchingRef.current = true;
			try {
				const {
					roomId: roomIdOut,
					messages: msgs,
					pageInfo,
				} = await dispatch(
					fetchRoomMessages({
						roomId,
						authToken: authState.authToken,
						limit: MESSAGE_PAGE_SIZE,
					})
				).unwrap();
				const resolvedRoom = roomIdOut || roomId;
				if (resolvedRoom && resolvedRoom !== requestedRoom) {
					return;
				}
				const mapped = msgs || [];
				setMessages(mapped);
				updatePageInfo(pageInfo, resolvedRoom || roomId, mapped);
			} catch (err) {
				console.error("load messages error", err);
			} finally {
				fetchingRef.current = false;
			}
		},
		[sockets.currentRoom, sockets.connected, dispatch, updatePageInfo, authState.authToken]
	);

	const fetchOlderMessages = useCallback(
		async (roomOverride) => {
			let roomId = pageInfoRef.current.channel;
			if (!roomId && roomOverride) {
				updatePageInfo(pageInfoRef.current, roomOverride);
				roomId = roomOverride;
			}
			if (!roomId) {
				console.error("Cannot fetch older messages without an active channel");
				dispatch(
					addSnackbar({
						snackbarMsg: "Unable to load messages: no active channel.",
						snackbarSeverity: "error",
						autoHideDuration: 2500,
					})
				);
				return;
			}
			if (fetchingRef.current || !authState.authToken || !sockets.connected) return;
			if (!pageInfoRef.current.hasMoreBefore) {
				return;
			}

			fetchingRef.current = true;
			loadingOlderRef.current = true;

			try {
				const {
					roomId: roomIdOut,
					messages: olderMessages,
					pageInfo,
				} = await dispatch(
					fetchRoomMessages({
						roomId: roomId,
						authToken: authState.authToken,
						before: pageInfoRef.current.nextBefore,
						limit: MESSAGE_PAGE_SIZE,
					})
				).unwrap();
				const resolvedRoom = roomIdOut || roomId;
				if (resolvedRoom && resolvedRoom !== pageInfoRef.current.channel) {
					return;
				}

				const mapped = olderMessages || [];
				setMessages((prev) => {
					const merged = mergeMessages(prev, mapped);
					updatePageInfo(pageInfo, resolvedRoom || roomId, merged);
					return merged;
				});
			} catch (err) {
				console.error("load older messages error", err);
			} finally {
				fetchingRef.current = false;
				loadingOlderRef.current = false;
			}
		},
		[sockets.currentRoom, sockets.connected, dispatch, mergeMessages, updatePageInfo, authState.authToken]
	);

	const resetRoomState = useCallback(() => {
		pageInfoRef.current = { hasMoreBefore: false, hasMoreAfter: false, nextBefore: null, nextAfter: null, channel: null };
		loadingOlderRef.current = false;
		fetchingRef.current = false;
	}, []);

	useEffect(() => {
		if (sockets.currentRoom) {
			updatePageInfo(pageInfoRef.current, sockets.currentRoom);
		}
	}, [sockets.currentRoom, updatePageInfo]);

	useEffect(() => {
		const socket = getSocketClient();
		if (authState.loggedIn && socket && sockets.connected) {
			socket.on("room_list", ([idMap, roomObjs]) => {
				setChannels(roomObjs);
				if (!sockets.currentRoom) {
					dispatch(
						setActiveSocketRoom({
							lastRoom: null,
							currentRoom: Object.keys(idMap)[0] || null,
						})
					);
				}
			});
			socket.on("joined_room", async (_id, msgs) => {
				if (!sockets.currentRoom) {
					dispatch(
						setActiveSocketRoom({
							lastRoom: sockets?.currentRoom || null,
							currentRoom: _id || null,
						})
					);
				}
				const mapped = await mapMessages(msgs || []);
				setMessages((prev) => {
					const merged = mergeMessages(prev, mapped);
					updatePageInfo(pageInfoRef.current, _id, merged);
					return merged;
				});
			});
			const handleIncomingMessage = async (payload) => {
				if (!payload) return;
				const normalized = Array.isArray(payload) ? payload : [payload];
				const mapped = await mapMessages(normalized);
				setMessages((prev) => {
					const merged = mergeMessages(prev, mapped);
					updatePageInfo(pageInfoRef.current, pageInfoRef.current.channel, merged);
					return merged;
				});
			};
			socket.on("message_sent", async (_id, msg) => {
				await handleIncomingMessage(msg);
			});
			socket.on("new_message", async (_id, msg) => {
				await handleIncomingMessage(msg);
			});
			socket.on("messages_updated", async (_id, payload) => {
				if (payload?.type === "delete" && payload.messageId) {
					setMessages((prev) => {
						const filtered = prev.filter((m) => m._id !== payload.messageId);
						updatePageInfo(pageInfoRef.current, pageInfoRef.current.channel, filtered);
						return filtered;
					});
					return;
				}

				if (payload?.type === "edit" && payload.message) {
					await handleIncomingMessage(payload.message);
					return;
				}

				await handleIncomingMessage(payload);
			});
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
			socket.emit("list_rooms");
		} else if (!authState.loggingIn && !authState.loggedIn) {
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
				socket.off("messages_updated");
				socket.off("user_list");
			}
			setChannels({});
			setMessages([]);
			setUsers([]);
			resetRoomState();
		};
	}, [
		authState.loggedIn,
		authState.loggingIn,
		authState.userId,
		sockets.connected,
		sockets.currentRoom,
		dispatch,
		mergeMessages,
		updatePageInfo,
		resetRoomState,
	]);

	useEffect(() => {
		setUsers([]);
	}, [sockets.currentRoom]);

	useEffect(() => {
		resetRoomState();
		setMessages([]);
		if (!sockets.currentRoom) return;

		fetchMessages();
	}, [sockets.currentRoom, fetchMessages, resetRoomState]);

	useEffect(
		() => () => {
			dispatch(setActiveSocketRoom({ currentRoom: null }));
		},
		[dispatch]
	);

	const sendMessage = (e) => {
		e?.preventDefault();
		if (!message || !sockets.currentRoom) return;
		const mentions = parseMentions(message, users);
		dispatch(emitSocketEvent({ event: "message_room", args: [sockets.currentRoom, message, mentions] }));
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
		try {
			const { profile: info } = await dispatch(fetchUserProfile({ userId: u._id, authToken: authState.authToken })).unwrap();
			if (info) {
				setUserPreviewEl(elRef.current);
				setUserPreviewUser(info);
			}
		} catch (err) {
			console.error(err);
		}
	};

	const openMessageMenu = (msg, pos) => {
		setSelectedMessage(msg);
		setMsgMenuPos(pos);
	};

	const closeMessageMenu = () => {
		setMsgMenuPos(null);
		setSelectedMessage(null);
	};

	const startEditSelectedMessage = () => {
		if (!selectedMessage) return;
		setEditingMessageId(selectedMessage._id);
		setEditingText(selectedMessage.content);
		closeMessageMenu();
	};

	const confirmDeleteSelectedMessage = () => {
		if (!selectedMessage || !sockets.currentRoom) return;
		dispatch(emitSocketEvent({ event: "delete_message", args: [sockets.currentRoom, selectedMessage._id] }));
		closeMessageMenu();
	};

	const commitEditMessage = () => {
		if (!editingMessageId || !sockets.currentRoom) return;
		const mentions = parseMentions(editingText, users);
		dispatch(emitSocketEvent({ event: "edit_message", args: [sockets.currentRoom, editingMessageId, editingText, mentions] }));
		setEditingMessageId(null);
		setEditingText("");
	};

	const cancelEditMessage = () => {
		setEditingMessageId(null);
		setEditingText("");
	};

	return {
		authState,
		message,
		setMessage,
		messages,
		setMessages,
		channels,
		currentRoom: sockets.currentRoom,
		users,
		roomAnchorEl,
		setRoomAnchorEl,
		userListAnchorEl,
		setUserListAnchorEl,
		userPreviewEl,
		setUserPreviewEl,
		userPreviewUser,
		setUserPreviewUser,
		msgMenuPos,
		selectedMessage,
		editingMessageId,
		editingText,
		setEditingText,
		sendMessage,
		clickRoomSelect,
		clickUserList,
		previewUser,
		openMessageMenu,
		closeMessageMenu,
		startEditSelectedMessage,
		confirmDeleteSelectedMessage,
		commitEditMessage,
		cancelEditMessage,
		fetchOlderMessages,
		pageInfoRef,
	};
}
