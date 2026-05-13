import { useState, useEffect, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";
import { fetchDmMessages } from "../../slices/dmApiSlice";
import { fetchUserProfile } from "../../slices/userApiSlice";
import { mapMessages } from "../../slices/chatApiSlice";
import { parseMentions } from "../../helpers/mentions";
import { emitSocketEvent } from "../../slices/socketSlice";
import { getSocketClient } from "../../helpers/socketClient";

export default function useDirectMessagePage(otherId) {
	const auth = useSelector((state) => state.auth);
	const socketState = useSelector((state) => state.sockets);
	const dispatch = useDispatch();

	const [threadId, setThreadId] = useState(null);
	const [messages, setMessages] = useState([]);
	const [message, setMessage] = useState("");
	const [otherUser, setOtherUser] = useState(null);
	const [editingMessageId, setEditingMessageId] = useState(null);
	const [editingText, setEditingText] = useState("");
	const [msgMenuPos, setMsgMenuPos] = useState(null);
	const [selectedMessage, setSelectedMessage] = useState(null);
	const listRef = useRef(null);
	const [userPreviewEl, setUserPreviewEl] = useState(null);
	const [previewMe, setPreviewMe] = useState(true);

	useEffect(() => {
		if (!auth.loggedIn || !otherId) return;
		dispatch(fetchUserProfile({ userId: otherId, authToken: auth.authToken }))
			.unwrap()
			.then(({ profile }) => setOtherUser(profile))
			.catch(() => {});
	}, [otherId, auth.loggedIn, auth.authToken, dispatch]);

	useEffect(() => {
		if (!auth.loggedIn || !otherId) return;
		const socket = getSocketClient();
		if (socket && socketState.connected) {
			dispatch(emitSocketEvent({ event: "join_dm", args: [otherId] }));
			socket.on("dm_joined", (tId, msgs) => {
				setThreadId(tId);
				setMessages(mapMessages(msgs));
			});
			socket.on("dm_sent", (_tId, msgs) => {
				if (_tId === threadId) setMessages(mapMessages(msgs));
			});
			socket.on("dm_new_message", (_tId, msgs) => {
				if (_tId === threadId) setMessages(mapMessages(msgs));
			});
			socket.on("dm_message_edited", (_tId, msgId, msgData) => {
				if (_tId === threadId) {
					setMessages((prevMessages) => prevMessages.map((msg) => (msg._id === msgId ? { ...msg, ...mapMessages([msgData])[0] } : msg)));
				}
			});
			socket.on("dm_delete_message", (_tId, msgId) => {
				if (_tId === threadId) {
					setMessages((prevMessages) => prevMessages.filter((msg) => msg._id !== msgId));
				}
			});
		}
		return () => {
			if (socket) {
				socket.off("dm_joined");
				socket.off("dm_sent");
				socket.off("dm_new_message");
				socket.off("dm_message_edited");
				socket.off("dm_delete_message");
			}
		};
	}, [otherId, auth.loggedIn, threadId, socketState.connected, dispatch]);

	useEffect(() => {
		if (!auth.loggedIn || !otherId) return;
		dispatch(fetchDmMessages({ userId: otherId, authToken: auth.authToken }))
			.unwrap()
			.then(({ threadId: tId, messages: msgs }) => {
				setThreadId(tId);
				setMessages(msgs);
			})
			.catch(() => {});
	}, [otherId, auth.loggedIn, auth.authToken, dispatch]);

	const sendMessage = (e) => {
		e?.preventDefault();
		if (!message || !threadId) return;
		const mentions = parseMentions(message, [otherUser].filter(Boolean));
		dispatch(emitSocketEvent({ event: "message_dm", args: [threadId, message, mentions] }));
		setMessage("");
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

	const commitEditMessage = () => {
		if (!editingMessageId) return;
		const mentions = parseMentions(editingText, [otherUser].filter(Boolean));
		dispatch(emitSocketEvent({ event: "dm_edit_message", args: [threadId, editingMessageId, editingText, mentions] }));
		setEditingMessageId(null);
		setEditingText("");
	};

	const cancelEditMessage = () => {
		setEditingMessageId(null);
		setEditingText("");
	};

	const confirmDeleteSelectedMessage = () => {
		if (!selectedMessage) return;
		dispatch(emitSocketEvent({ event: "dm_delete_message", args: [threadId, selectedMessage._id] }));
		closeMessageMenu();
	};

	const previewUser = (elRef, u) => {
		if (!elRef?.current) {
			setUserPreviewEl(null);
			setPreviewMe(false);
			return;
		} else {
			setUserPreviewEl(elRef.current);
			if (u?._id && u._id === auth.userId) {
				setPreviewMe(true);
			} else {
				setPreviewMe(false);
			}
		}
	};

	return {
		auth,
		otherUser,
		message,
		setMessage,
		messages,
		editingMessageId,
		editingText,
		setEditingText,
		sendMessage,
		msgMenuPos,
		openMessageMenu,
		closeMessageMenu,
		selectedMessage,
		startEditSelectedMessage,
		confirmDeleteSelectedMessage,
		commitEditMessage,
		cancelEditMessage,
		listRef,
		userPreviewEl,
		setUserPreviewEl,
		previewMe,
		setPreviewMe,
		previewUser,
	};
}
