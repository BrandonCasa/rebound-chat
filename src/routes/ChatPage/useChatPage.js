import { useState, useEffect, useRef, useCallback } from "react";
import useWindowDimensions from "../../helpers/useWindowDimensions";
import { useDispatch, useSelector } from "react-redux";
import { fetchRoomMessages, mapMessages } from "../../slices/chatApiSlice";
import { parseMentions } from "../../helpers/mentions";
import { fetchUserProfile } from "../../slices/userApiSlice";
import { setSocketRoom } from "../../slices/authSlice";
import { addSnackbar } from "../../slices/snackbarSlice";
import { getApiBase } from "../../helpers/api";
import { useInView } from "react-intersection-observer";

const REQUEST_BASE = getApiBase();
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

	const updatePageInfo = useCallback((pageInfo = {}, roomIdOut = null, nextMessages = []) => {
		pageInfoRef.current = {
			hasMoreBefore: pageInfo.hasMoreBefore ?? pageInfoRef.current.hasMoreBefore,
			hasMoreAfter: pageInfo.hasMoreAfter ?? pageInfoRef.current.hasMoreAfter,
			nextBefore: pageInfo.nextBefore ?? nextMessages[0]?._id ?? pageInfoRef.current.nextBefore,
			nextAfter: pageInfo.nextAfter ?? nextMessages[nextMessages.length - 1]?._id ?? pageInfoRef.current.nextAfter,
			channel: roomIdOut ?? pageInfoRef.current.roomIdOut,
		};
	}, []);

	const fetchMessages = useCallback(
		async (roomOverride) => {
			const roomId = roomOverride || authState.socketInfo.currentRoom;
			if (!roomId || fetchingRef.current || !authState.authToken || !sockets.connected) return;
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
				const mapped = msgs || [];
				setMessages(mapped);
				updatePageInfo(pageInfo, roomIdOut, mapped);
			} catch (err) {
				console.error("load messages error", err);
			} finally {
				fetchingRef.current = false;
			}
		},
		[authState.socketInfo.currentRoom, sockets.connected, dispatch, updatePageInfo]
	);

	const fetchOlderMessages = useCallback(
		async (roomOverride) => {
			const roomId = roomOverride || authState.socketInfo.currentRoom || pageInfoRef.current.channel;
			if (!roomId || fetchingRef.current || !authState.authToken || !sockets.connected) return;
			if (!roomId || fetchingRef.current || !pageInfoRef.current.hasMoreBefore) {
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

				const mapped = olderMessages || [];
				setMessages((prev) => {
					const merged = mergeMessages(prev, mapped);
					updatePageInfo(pageInfo, roomIdOut, merged);
					return merged;
				});
			} catch (err) {
				console.error("load older messages error", err);
			} finally {
				fetchingRef.current = false;
				loadingOlderRef.current = false;
			}
		},
		[authState.socketInfo.currentRoom, sockets.connected, dispatch, mergeMessages, pageInfoRef, updatePageInfo]
	);

	const resetRoomState = useCallback(() => {
		pageInfoRef.current = { hasMoreBefore: false, hasMoreAfter: false, nextBefore: null, nextAfter: null };
		loadingOlderRef.current = false;
		fetchingRef.current = false;
	}, []);

	useEffect(() => {
		if (authState.loggedIn && sockets.socketClient && sockets.connected) {
			sockets.socketClient.on("room_list", ([idMap, roomObjs]) => {
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
			sockets.socketClient.on("joined_room", async (_id, msgs) => {
				if (!authState.socketInfo.currentRoom) {
					dispatch(
						setSocketRoom({
							lastRoom: authState?.socketInfo?.currentRoom || null,
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
				//if (mapped.length) {
				//	requestAnimationFrame(scrollToBottom);
				//}
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
			sockets.socketClient.on("message_sent", async (_id, msg) => {
				await handleIncomingMessage(msg);
			});
			sockets.socketClient.on("new_message", async (_id, msg) => {
				await handleIncomingMessage(msg);
			});
			sockets.socketClient.on("messages_updated", async (_id, payload) => {
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
			sockets.socketClient.on("user_list", (_roomId, list, sender, evt) => {
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
			sockets.socketClient.emit("list_rooms");
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
			if (sockets.socketClient) {
				sockets.socketClient.off("room_list");
				sockets.socketClient.off("joined_room");
				sockets.socketClient.off("message_sent");
				sockets.socketClient.off("new_message");
				sockets.socketClient.off("messages_updated");
				sockets.socketClient.off("user_list");
			}
			setChannels({});
			setMessages([]);
			setUsers([]);
			resetRoomState("");
		};
	}, [sockets.socketClient, authState.loggedIn, authState.loggingIn, authState.socketInfo.currentRoom, authState.userId, sockets.connected, dispatch]);

	useEffect(() => {
		setUsers([]);
	}, [authState.socketInfo.currentRoom]);

	useEffect(() => {
		setMessages([]);
		fetchMessages();
	}, [authState.socketInfo.currentRoom, fetchMessages]);

	useEffect(
		() => () => {
			dispatch(setSocketRoom({ currentRoom: null }));
		},
		[dispatch]
	);

	const sendMessage = (e) => {
		e?.preventDefault();
		if (!message || !authState.socketInfo.currentRoom) return;
		const mentions = parseMentions(message, users);
		sockets.socketClient.emit("message_room", [authState.socketInfo.currentRoom, message, mentions]);
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
		if (!selectedMessage) return;
		sockets.socketClient.emit("delete_message", authState.socketInfo.currentRoom, selectedMessage._id);
		closeMessageMenu();
	};

	const commitEditMessage = () => {
		if (!editingMessageId) return;
		const mentions = parseMentions(editingText, users);
		sockets.socketClient.emit("edit_message", authState.socketInfo.currentRoom, editingMessageId, editingText, mentions);
		setEditingMessageId(null);
		setEditingText("");
	};

	const cancelEditMessage = () => {
		setEditingMessageId(null);
		setEditingText("");
	};

	const { width, height } = useWindowDimensions();

	//useEffect(() => {
	//	const el = listRef.current;
	//	if (!el) return;
	//	requestAnimationFrame(() => {
	//		el.scrollTop = 0;
	//	});
	//}, [width, height, messages.length]);

	return {
		authState,
		message,
		setMessage,
		messages,
		setMessages,
		channels,
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
