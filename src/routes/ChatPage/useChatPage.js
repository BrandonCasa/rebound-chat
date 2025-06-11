import { useState, useEffect, useRef, useCallback } from "react";
import useWindowDimensions from "../../helpers/useWindowDimensions";
import { useDispatch, useSelector } from "react-redux";
import { fetchRoomMessages, mapMessages } from "../../slices/chatApiSlice";
import { fetchUserProfile } from "../../slices/userApiSlice";
import socketIoHelper from "../../helpers/socket";
import { setSocketRoom } from "../../slices/authSlice";
import { addSnackbar } from "../../slices/snackbarSlice";
import { getApiBase } from "../../helpers/api";

const REQUEST_BASE = getApiBase();

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

       const fetchMessages = useCallback(async () => {
                if (!authState.socketInfo.currentRoom || fetchingRef.current) return;
                fetchingRef.current = true;
                try {
                        const { messages: msgs } = await dispatch(
                                fetchRoomMessages({ roomId: authState.socketInfo.currentRoom, authToken: authState.authToken })
                        ).unwrap();
                        setMessages(msgs);
                } catch (err) {
                        console.error("load messages error", err);
                } finally {
                        fetchingRef.current = false;
                }
        }, [authState.socketInfo.currentRoom, authState.authToken, dispatch]);

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
			socket.on("joined_room", (_id, msgs) => {
				setMessages(mapMessages(msgs));
			});
			socket.on("message_sent", (_id, msgs) => {
				setMessages(mapMessages(msgs));
			});
			socket.on("new_message", (_id, msgs) => {
				setMessages(mapMessages(msgs));
			});
			socket.on("messages_updated", (_id, msgs) => {
				setMessages(mapMessages(msgs));
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
	}, [authState.loggedIn, authState.loggingIn, authState.socketInfo.currentRoom, authState.userId, authState.socketInfo.connected, dispatch]);

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
		const s = socketIoHelper.getSocket();
		s.emit("message_room", [authState.socketInfo.currentRoom, message]);
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
                        const { profile: info } = await dispatch(
                                fetchUserProfile({ userId: u._id, authToken: authState.authToken })
                        ).unwrap();
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
		s.emit("edit_message", authState.socketInfo.currentRoom, editingMessageId, editingText);
		setEditingMessageId(null);
		setEditingText("");
	};

	const cancelEditMessage = () => {
		setEditingMessageId(null);
		setEditingText("");
	};

	const { width, height } = useWindowDimensions();

	useEffect(() => {
		const el = listRef.current;
		if (!el) return;
		requestAnimationFrame(() => {
			el.scrollTop = 0;
		});
	}, [width, height, messages.length]);

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
		listRef,
	};
}
