import { useState, useEffect, useCallback } from "react";
import { useDispatch, useSelector } from "react-redux";
import { parseMentions } from "../../helpers/mentions";
import { fetchUserProfile } from "../../slices/userApiSlice";
import socketIoHelper from "../../helpers/socket";
import { setSocketRoom } from "../../slices/authSlice";
import useChatMessages from "./hooks/useChatMessages";
import useChatSockets from "./hooks/useChatSockets";
import useRoomLifecycle from "./hooks/useRoomLifecycle";

export default function useChatPage() {
	const authState = useSelector((state) => state.auth);
	const dispatch = useDispatch();

	const [message, setMessage] = useState("");
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

	const {
		messages,
		setMessages,
		listRef,
		handleScroll,
		fetchMessages,
                mergeMessages,
                updatePageInfo,
                scrollToBottom,
                isNearBottom,
                pageInfoRef,
                loadingOlderRef,
                resetRoomState,
                initialFetchRoomRef,
                loadingSkeletonCount,
        } = useChatMessages(authState, dispatch);

	useChatSockets({
		authState,
		dispatch,
		setChannels,
		setUsers,
		setMessages,
		mergeMessages,
		updatePageInfo,
		scrollToBottom,
		isNearBottom,
		pageInfoRef,
	});

	useRoomLifecycle({
		authState,
		fetchMessages,
		setMessages,
		setUsers,
		resetRoomState,
		initialFetchRoomRef,
		loadingOlderRef,
		isNearBottom,
		scrollToBottom,
	});

	useEffect(
		() => () => {
			dispatch(setSocketRoom({ currentRoom: null }));
		},
		[dispatch]
	);

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

        const clickRoomSelect = useCallback((e) => {
                setRoomAnchorEl(e.currentTarget);
                setUserListAnchorEl(null);
        }, []);

        const clickUserList = useCallback((e) => {
                setUserListAnchorEl(e.currentTarget);
                setRoomAnchorEl(null);
        }, []);

        const previewUser = useCallback(
                async (elRef, u) => {
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
                },
                [authState.authToken, dispatch]
        );

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

        const confirmDeleteSelectedMessage = useCallback(() => {
                if (!selectedMessage) return;
                const s = socketIoHelper.getSocket();
                s.emit("delete_message", authState.socketInfo.currentRoom, selectedMessage._id);
                closeMessageMenu();
        }, [authState.socketInfo.currentRoom, closeMessageMenu, selectedMessage]);

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
                loadingSkeletonCount,
        };
}
