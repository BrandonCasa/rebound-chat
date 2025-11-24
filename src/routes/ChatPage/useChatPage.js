import { useState, useEffect, useRef, useCallback } from "react";
import useWindowDimensions from "../../helpers/useWindowDimensions";
import { useDispatch, useSelector } from "react-redux";
import { fetchRoomMessages, mapMessages } from "../../slices/chatApiSlice";
import { parseMentions } from "../../helpers/mentions";
import { fetchUserProfile } from "../../slices/userApiSlice";
import socketIoHelper from "../../helpers/socket";
import { setSocketRoom } from "../../slices/authSlice";
import { addSnackbar } from "../../slices/snackbarSlice";
const MESSAGE_PAGE_SIZE = 50;
const SCROLL_TRIGGER_PX = 150;

export default function useChatPage() {
	const authState = useSelector((state) => state.auth);
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
        const listRef = useRef(null);
        const fetchingRef = useRef(false);
        const pageInfoRef = useRef({ hasMoreBefore: false, hasMoreAfter: false, nextBefore: null, nextAfter: null });
        const loadingOlderRef = useRef(false);

        const mergeMessages = useCallback((existing, incoming) => {
                const merged = new Map();
                existing.forEach((msg) => merged.set(msg._id, msg));
                incoming.forEach((msg) => merged.set(msg._id, msg));

                return Array.from(merged.values()).sort(
                        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
                );
        }, []);

        const updatePageInfo = useCallback((pageInfo = {}, nextMessages = []) => {
                pageInfoRef.current = {
                        hasMoreBefore: pageInfo.hasMoreBefore ?? pageInfoRef.current.hasMoreBefore,
                        hasMoreAfter: pageInfo.hasMoreAfter ?? pageInfoRef.current.hasMoreAfter,
                        nextBefore: pageInfo.nextBefore ?? nextMessages[0]?._id ?? pageInfoRef.current.nextBefore,
                        nextAfter:
                                pageInfo.nextAfter ?? nextMessages[nextMessages.length - 1]?._id ?? pageInfoRef.current.nextAfter,
                };
        }, []);

        const scrollToBottom = useCallback(() => {
                const el = listRef.current;
                if (!el) return;
                el.scrollTop = el.scrollHeight;
        }, []);

        const isNearBottom = useCallback(() => {
                const el = listRef.current;
                if (!el) return false;
                return el.scrollHeight - el.clientHeight - el.scrollTop < SCROLL_TRIGGER_PX;
        }, []);

        const fetchMessages = useCallback(async () => {
                if (!authState.socketInfo.currentRoom || fetchingRef.current) return;
                fetchingRef.current = true;
                try {
                        const { messages: msgs, pageInfo } = await dispatch(
                                fetchRoomMessages({
                                        roomId: authState.socketInfo.currentRoom,
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
        }, [authState.socketInfo.currentRoom, authState.authToken, dispatch, scrollToBottom, updatePageInfo]);

        const fetchOlderMessages = useCallback(async () => {
                if (
                        !authState.socketInfo.currentRoom ||
                        fetchingRef.current ||
                        !pageInfoRef.current.hasMoreBefore ||
                        !pageInfoRef.current.nextBefore
                ) {
                        return;
                }

                fetchingRef.current = true;
                loadingOlderRef.current = true;
                const el = listRef.current;
                const previousScrollHeight = el?.scrollHeight ?? 0;
                const previousScrollTop = el?.scrollTop ?? 0;

                try {
                        const { messages: olderMessages, pageInfo } = await dispatch(
                                fetchRoomMessages({
                                        roomId: authState.socketInfo.currentRoom,
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
                                const newHeight = el.scrollHeight;
                                el.scrollTop = newHeight - previousScrollHeight + previousScrollTop;
                        });
                } catch (err) {
                        console.error("load older messages error", err);
                } finally {
                        fetchingRef.current = false;
                        loadingOlderRef.current = false;
                }
        }, [authState.authToken, authState.socketInfo.currentRoom, dispatch, mergeMessages, updatePageInfo]);

        const handleScroll = useCallback(
                (e) => {
                        if (e.target.scrollTop < SCROLL_TRIGGER_PX) {
                                fetchOlderMessages();
                        }
                },
                [fetchOlderMessages]
        );

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
                                const mapped = await mapMessages(msgs || []);
                                setMessages((prev) => {
                                        const merged = mergeMessages(prev, mapped);
                                        updatePageInfo(pageInfoRef.current, merged);
                                        return merged;
                                });
                                if (mapped.length) {
                                        requestAnimationFrame(scrollToBottom);
                                }
                        });

                        const handleIncomingMessage = async (payload) => {
                                if (!payload) return;
                                const normalized = Array.isArray(payload) ? payload : [payload];
                                const mapped = await mapMessages(normalized);
                                setMessages((prev) => {
                                        const merged = mergeMessages(prev, mapped);
                                        updatePageInfo(pageInfoRef.current, merged);
                                        return merged;
                                });
                                if (isNearBottom()) {
                                        requestAnimationFrame(scrollToBottom);
                                }
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
                                                updatePageInfo(pageInfoRef.current, filtered);
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
		};
        }, [
                authState.loggedIn,
                authState.loggingIn,
                authState.socketInfo.currentRoom,
                authState.userId,
                authState.socketInfo.connected,
                dispatch,
                isNearBottom,
                mergeMessages,
                scrollToBottom,
                updatePageInfo,
        ]);

        useEffect(() => {
                setUsers([]);
                pageInfoRef.current = { hasMoreBefore: false, hasMoreAfter: false, nextBefore: null, nextAfter: null };
        }, [authState.socketInfo.currentRoom]);

        useEffect(() => {
                setMessages([]);
                fetchMessages();
        }, [authState.socketInfo.currentRoom, fetchMessages]);

        useEffect(() => {
                if (loadingOlderRef.current) return;
                if (isNearBottom()) {
                        requestAnimationFrame(scrollToBottom);
                }
        }, [isNearBottom, messages.length, scrollToBottom]);

	useEffect(
		() => () => {
			dispatch(setSocketRoom({ currentRoom: null }));
		},
		[dispatch]
	);

        const sendMessage = (e) => {
                e?.preventDefault();
                if (!message || !authState.socketInfo.currentRoom) return;
                const s = socketIoHelper.getSocket();
                const mentions = parseMentions(message, users);
                s.emit("message_room", [authState.socketInfo.currentRoom, message, mentions]);
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
		const s = socketIoHelper.getSocket();
		s.emit("delete_message", authState.socketInfo.currentRoom, selectedMessage._id);
		closeMessageMenu();
	};

        const commitEditMessage = () => {
                if (!editingMessageId) return;
                const s = socketIoHelper.getSocket();
                const mentions = parseMentions(editingText, users);
                s.emit("edit_message", authState.socketInfo.currentRoom, editingMessageId, editingText, mentions);
                setEditingMessageId(null);
                setEditingText("");
        };

	const cancelEditMessage = () => {
		setEditingMessageId(null);
		setEditingText("");
	};

        const { width, height } = useWindowDimensions();

        useEffect(() => {
                if (loadingOlderRef.current) return;
                if (isNearBottom()) {
                        requestAnimationFrame(scrollToBottom);
                }
        }, [height, isNearBottom, scrollToBottom, width]);

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
                  handleScroll,
                  listRef,
         };
}
