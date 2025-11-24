import { useCallback, useEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";

import useWindowDimensions from "../../helpers/useWindowDimensions";
import { parseMentions } from "../../helpers/mentions";
import socketIoHelper from "../../helpers/socket";
import { fetchRoomMessages, mapMessages } from "../../slices/chatApiSlice";
import { setSocketRoom } from "../../slices/authSlice";
import { fetchUserProfile } from "../../slices/userApiSlice";
import { addSnackbar } from "../../slices/snackbarSlice";

const MESSAGE_PAGE_SIZE = 50;
const SCROLL_TRIGGER_PX = 50;

const initialPageInfo = { hasMoreBefore: false, nextBefore: null };

function useScrollHelpers(listRef) {
	const scrollToBottom = useCallback(() => {
		const el = listRef.current;
		if (el) el.scrollTop = el.scrollHeight;
	}, [listRef]);

	const isNearBottom = useCallback(() => {
		const el = listRef.current;
		if (!el) return false;
		return el.scrollHeight - el.clientHeight - el.scrollTop < SCROLL_TRIGGER_PX;
	}, [listRef]);

	return { isNearBottom, scrollToBottom };
}

function useAnchors() {
	const [roomAnchorEl, setRoomAnchorEl] = useState(null);
	const [userListAnchorEl, setUserListAnchorEl] = useState(null);

	const clickRoomSelect = useCallback((e) => {
		setRoomAnchorEl(e.currentTarget);
		setUserListAnchorEl(null);
	}, []);

	const clickUserList = useCallback((e) => {
		setUserListAnchorEl(e.currentTarget);
		setRoomAnchorEl(null);
	}, []);

	return {
		roomAnchorEl,
		setRoomAnchorEl,
		userListAnchorEl,
		setUserListAnchorEl,
		clickRoomSelect,
		clickUserList,
	};
}

function useUserPreview(authState, dispatch) {
	const [userPreviewEl, setUserPreviewEl] = useState(null);
	const [userPreviewUser, setUserPreviewUser] = useState(null);

	const previewUser = useCallback(
		async (elRef, u) => {
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
		},
		[authState.authToken, dispatch]
	);

	return { previewUser, setUserPreviewEl, setUserPreviewUser, userPreviewEl, userPreviewUser };
}

function useMessageActions(authState, users) {
	const [msgMenuPos, setMsgMenuPos] = useState(null);
	const [selectedMessage, setSelectedMessage] = useState(null);
	const [editingMessageId, setEditingMessageId] = useState(null);
	const [editingText, setEditingText] = useState("");

	const openMessageMenu = useCallback((msg, pos) => {
		setSelectedMessage(msg);
		setMsgMenuPos(pos);
	}, []);

	const closeMessageMenu = useCallback(() => {
		setMsgMenuPos(null);
		setSelectedMessage(null);
	}, []);

	const startEditSelectedMessage = useCallback(() => {
		if (!selectedMessage) return;
		setEditingMessageId(selectedMessage._id);
		setEditingText(selectedMessage.content);
		closeMessageMenu();
	}, [closeMessageMenu, selectedMessage]);

	const commitEditMessage = useCallback(() => {
		if (!editingMessageId) return;
		const s = socketIoHelper.getSocket();
		const mentions = parseMentions(editingText, users);
		s.emit("edit_message", authState.socketInfo.currentRoom, editingMessageId, editingText, mentions);
		setEditingMessageId(null);
		setEditingText("");
	}, [authState.socketInfo.currentRoom, editingMessageId, editingText, users]);

	const cancelEditMessage = useCallback(() => {
		setEditingMessageId(null);
		setEditingText("");
	}, []);

	const confirmDeleteSelectedMessage = useCallback(() => {
		if (!selectedMessage) return;
		const s = socketIoHelper.getSocket();
		s.emit("delete_message", authState.socketInfo.currentRoom, selectedMessage._id);
		closeMessageMenu();
	}, [authState.socketInfo.currentRoom, closeMessageMenu, selectedMessage]);

	return {
		cancelEditMessage,
		closeMessageMenu,
		commitEditMessage,
		confirmDeleteSelectedMessage,
		editingMessageId,
		editingText,
		msgMenuPos,
		openMessageMenu,
		selectedMessage,
		setEditingText,
		startEditSelectedMessage,
	};
}

function useMessagePagination(authState, dispatch, listRef, scrollToBottom, isNearBottom) {
        const [messages, setMessages] = useState([]);
        const [pageInfo, setPageInfo] = useState(initialPageInfo);
        const [isLoadingOlder, setIsLoadingOlder] = useState(false);
        const pageInfoRef = useRef(initialPageInfo);
        const fetchingRef = useRef(false);
        const loadingOlderRef = useRef(false);
        const initialFetchRoomRef = useRef(null);

	const mergeMessages = useCallback((existing, incoming) => {
		const byId = new Map();
		[...existing, ...incoming].forEach((msg) => byId.set(msg._id, msg));
		return Array.from(byId.values()).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
	}, []);

        const updatePageInfo = useCallback(
                (nextPageInfo = {}, nextMessages = []) => {
                        const mergedPageInfo = {
                                ...pageInfoRef.current,
                                ...nextPageInfo,
                                hasMoreBefore: nextPageInfo.hasMoreBefore ?? pageInfoRef.current.hasMoreBefore,
                                nextBefore:
                                        nextPageInfo.nextBefore ??
                                        nextMessages[0]?._id ??
                                        pageInfoRef.current.nextBefore,
                        };

                        pageInfoRef.current = mergedPageInfo;
                        setPageInfo(mergedPageInfo);
                },
                []
        );

	const fetchMessages = useCallback(
		async (roomOverride) => {
			const roomId = roomOverride || authState.socketInfo.currentRoom;
			if (!roomId || fetchingRef.current || !authState.authToken) return;

			fetchingRef.current = true;
			try {
				const { messages: msgs, pageInfo } = await dispatch(
					fetchRoomMessages({
						roomId,
						authToken: authState.authToken,
						limit: MESSAGE_PAGE_SIZE,
					})
				).unwrap();
				const mapped = msgs || [];
				setMessages(mapped);
				updatePageInfo(pageInfo, mapped);
				requestAnimationFrame(scrollToBottom);
			} catch (err) {
				console.error("load messages error", err);
			} finally {
				fetchingRef.current = false;
			}
		},
		[authState.authToken, authState.socketInfo.currentRoom, dispatch, scrollToBottom, updatePageInfo]
	);

	const fetchOlderMessages = useCallback(async () => {
		const { currentRoom } = authState.socketInfo;
		if (!currentRoom || fetchingRef.current || loadingOlderRef.current || !pageInfoRef.current.hasMoreBefore || !pageInfoRef.current.nextBefore) {
			return;
		}

		fetchingRef.current = true;
                loadingOlderRef.current = true;
                setIsLoadingOlder(true);
                const el = listRef.current;
                const prevHeight = el?.scrollHeight ?? 0;
                const prevTop = el?.scrollTop ?? 0;

		try {
			const { messages: olderMessages, pageInfo } = await dispatch(
				fetchRoomMessages({
					roomId: currentRoom,
					authToken: authState.authToken,
					before: pageInfoRef.current.nextBefore,
					limit: MESSAGE_PAGE_SIZE,
				})
			).unwrap();

			const mapped = olderMessages || [];
			setMessages((prev) => {
				const merged = mergeMessages(mapped, prev);
				updatePageInfo(pageInfo, merged);
				return merged;
			});

			requestAnimationFrame(() => {
				if (!el) return;
				const delta = el.scrollHeight - prevHeight;
				el.scrollTop = prevTop + delta;
			});
                } catch (err) {
                        console.error("load older messages error", err);
                } finally {
                        fetchingRef.current = false;
                        loadingOlderRef.current = false;
                        setIsLoadingOlder(false);
                }
        }, [authState.authToken, authState.socketInfo, dispatch, listRef, mergeMessages, updatePageInfo]);

	const handleScroll = useCallback(
		(e) => {
			if (e.target.scrollTop < SCROLL_TRIGGER_PX) {
				fetchOlderMessages();
			}
		},
		[fetchOlderMessages]
	);

	const handleIncomingMessages = useCallback(
		async (payload, { forceScroll = false } = {}) => {
			if (!payload) return;
			const normalized = Array.isArray(payload) ? payload : [payload];
			const mapped = await mapMessages(normalized);
			setMessages((prev) => {
				const merged = mergeMessages(prev, mapped);
				updatePageInfo(pageInfoRef.current, merged);
				return merged;
			});
			if (forceScroll || isNearBottom()) requestAnimationFrame(scrollToBottom);
		},
		[isNearBottom, mergeMessages, scrollToBottom, updatePageInfo]
	);

	const handleDeletedMessage = useCallback(
		(messageId) => {
			if (!messageId) return;
			setMessages((prev) => {
				const filtered = prev.filter((m) => m._id !== messageId);
				updatePageInfo(pageInfoRef.current, filtered);
				return filtered;
			});
		},
		[updatePageInfo]
	);

        const resetAndFetchForRoom = useCallback(
                (roomId) => {
                        pageInfoRef.current = initialPageInfo;
                        setPageInfo(initialPageInfo);
                        setIsLoadingOlder(false);
                        if (!roomId) {
                                initialFetchRoomRef.current = null;
                                setMessages([]);
                                return;
                        }
			if (initialFetchRoomRef.current === roomId) return;
			initialFetchRoomRef.current = roomId;
			setMessages([]);
			fetchMessages(roomId);
		},
		[fetchMessages]
	);

	const syncScrollIfNearBottom = useCallback(() => {
		if (!loadingOlderRef.current && isNearBottom()) {
			requestAnimationFrame(scrollToBottom);
		}
	}, [isNearBottom, scrollToBottom]);

	useEffect(() => {
		syncScrollIfNearBottom();
	}, [messages.length, syncScrollIfNearBottom]);

	return {
		fetchOlderMessages,
		handleDeletedMessage,
		handleIncomingMessages,
                handleScroll,
                isLoadingOlder,
                loadingOlderRef,
                messages,
                pageInfo,
                setMessages,
                resetAndFetchForRoom,
                syncScrollIfNearBottom,
        };
}

export default function useChatPage() {
	const authState = useSelector((state) => state.auth);
	const dispatch = useDispatch();

	const [message, setMessage] = useState("");
	const [channels, setChannels] = useState({});
	const [users, setUsers] = useState([]);

	const listRef = useRef(null);
        const { isNearBottom, scrollToBottom } = useScrollHelpers(listRef);
        const {
                fetchOlderMessages,
                handleDeletedMessage,
                handleIncomingMessages,
                handleScroll,
                isLoadingOlder,
                loadingOlderRef,
                messages,
                pageInfo,
                setMessages,
                resetAndFetchForRoom,
                syncScrollIfNearBottom,
        } = useMessagePagination(authState, dispatch, listRef, scrollToBottom, isNearBottom);

	const { clickRoomSelect, clickUserList, roomAnchorEl, setRoomAnchorEl, setUserListAnchorEl, userListAnchorEl } = useAnchors();
	const { previewUser, setUserPreviewEl, setUserPreviewUser, userPreviewEl, userPreviewUser } = useUserPreview(authState, dispatch);
	const {
		cancelEditMessage,
		closeMessageMenu,
		commitEditMessage,
		confirmDeleteSelectedMessage,
		editingMessageId,
		editingText,
		msgMenuPos,
		openMessageMenu,
		selectedMessage,
		setEditingText,
		startEditSelectedMessage,
	} = useMessageActions(authState, users);

	useEffect(() => {
		const socket = socketIoHelper.getSocket();

		if (authState.loggedIn && socket) {
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

			socket.on("joined_room", async (_id, msgs) => {
				await handleIncomingMessages(msgs || [], { forceScroll: true });
			});
			socket.on("message_sent", async (_id, msg) => handleIncomingMessages(msg));
			socket.on("new_message", async (_id, msg) => handleIncomingMessages(msg));
			socket.on("messages_updated", async (_id, payload) => {
				if (payload?.type === "delete" && payload.messageId) {
					handleDeletedMessage(payload.messageId);
					return;
				}

				if (payload?.type === "edit" && payload.message) {
					await handleIncomingMessages(payload.message);
					return;
				}

				await handleIncomingMessages(payload);
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
			setUsers([]);
		};
        }, [
                authState.loggedIn,
                authState.loggingIn,
                authState.socketInfo.currentRoom,
                authState.socketInfo.connected,
                authState.userId,
                dispatch,
                handleDeletedMessage,
                handleIncomingMessages,
        ]);

	useEffect(() => {
		setUsers([]);
		resetAndFetchForRoom(authState.socketInfo.currentRoom);
	}, [authState.authToken, authState.socketInfo.currentRoom, resetAndFetchForRoom]);

	useEffect(() => () => dispatch(setSocketRoom({ currentRoom: null })), [dispatch]);

	const sendMessage = useCallback(
		(e) => {
			e?.preventDefault();
			if (!message || !authState.socketInfo.currentRoom) return;
			const s = socketIoHelper.getSocket();
			const mentions = parseMentions(message, users);
			s.emit("message_room", [authState.socketInfo.currentRoom, message, mentions]);
			setMessage("");
		},
		[authState.socketInfo.currentRoom, message, users]
	);

	const { width, height } = useWindowDimensions();
	useEffect(() => {
		syncScrollIfNearBottom();
	}, [height, width, syncScrollIfNearBottom]);

	return {
		authState,
		cancelEditMessage,
		channels,
		clickRoomSelect,
		clickUserList,
		closeMessageMenu,
		commitEditMessage,
		confirmDeleteSelectedMessage,
		editingMessageId,
		editingText,
                handleScroll,
                isLoadingOlder,
                listRef,
                message,
                messages,
                msgMenuPos,
                openMessageMenu,
                pageInfo,
                previewUser,
                roomAnchorEl,
                scrollToBottom,
                selectedMessage,
                sendMessage,
                setEditingText,
                setMessage,
                setMessages,
                setRoomAnchorEl,
                setUserListAnchorEl,
                setUserPreviewEl,
                setUserPreviewUser,
		startEditSelectedMessage,
		userListAnchorEl,
		userPreviewEl,
                userPreviewUser,
                users,
                fetchOlderMessages,
        };
}
