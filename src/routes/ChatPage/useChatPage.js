import { useState, useEffect, useRef, useCallback } from "react";
import { useDispatch, useSelector } from "react-redux";
import axios from "axios";
import socketIoHelper from "../../helpers/socket";
import { setSocketRoom } from "../../slices/authSlice";
import { addSnackbar } from "../../slices/snackbarSlice";
import cacheMedia from "../../helpers/cacheMedia";

const REQUEST_BASE =
  process.env.NODE_ENV === "development"
    ? `http://localhost:6001/api`
    : globalThis.IN_ELECTRON_ENV
      ? `https://rebound.nexus/api`
      : "/api";

const mapMessages = (msgs) =>
  msgs.map((m) => ({
    ...m,
    sender: {
      ...m.sender,
      avatarUrl: m.sender?.avatarUrl
        ? cacheMedia(REQUEST_BASE + m.sender.avatarUrl)
        : null,
    },
  }));

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
      avatarUrl: u.avatarUrl ? cacheMedia(REQUEST_BASE + u.avatarUrl) : null,
      bannerUrl: u.bannerUrl ? cacheMedia(REQUEST_BASE + u.bannerUrl) : null,
    };
  } catch (err) {
    console.error(err);
    return null;
  }
}

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
  const CHUNK_SIZE = 40;
  const DISPLAY_MESSAGE_LIMIT = 120;
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [totalMessages, setTotalMessages] = useState(0);

  const fetchChunk = useCallback(
    async (newOffset = 0) => {
      if (!authState.socketInfo.currentRoom || fetchingRef.current) return;
      fetchingRef.current = true;
      try {
        const { data } = await axios.get(
          `${REQUEST_BASE}/rooms/${authState.socketInfo.currentRoom}/messages`,
          {
            headers: { Authorization: `Bearer ${authState.authToken}` },
            params: { offset: newOffset, limit: CHUNK_SIZE },
          },
        );
        const mapped = mapMessages(data.messages.reverse());
        setMessages((prev) =>
          newOffset === 0
            ? mapped
            : [...mapped, ...prev].slice(-DISPLAY_MESSAGE_LIMIT),
        );
        setOffset(newOffset);
        setTotalMessages(data.total);
        setHasMore(newOffset + CHUNK_SIZE < data.total);
      } catch (err) {
        console.error("load messages error", err);
      } finally {
        fetchingRef.current = false;
      }
    },
    [authState.socketInfo.currentRoom, authState.authToken],
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
            }),
          );
        }
      });
      socket.on("joined_room", () => fetchChunk(0));
      socket.on("message_sent", (_id, msgs) => {
        const last = msgs[msgs.length - 1];
        if (!last) return;
        setMessages((prev) =>
          [...prev, ...mapMessages([last])].slice(-DISPLAY_MESSAGE_LIMIT),
        );
      });
      socket.on("new_message", (_id, msgs) => {
        const last = msgs[msgs.length - 1];
        if (!last) return;
        setMessages((prev) =>
          [...prev, ...mapMessages([last])].slice(-DISPLAY_MESSAGE_LIMIT),
        );
      });
      socket.on("messages_updated", () => fetchChunk(0));
      socket.on("user_list", (_roomId, list, sender, evt) => {
        if (sender.id !== authState.userId) {
          dispatch(
            addSnackbar({
              snackbarMsg: `'${sender.displayName}' ${evt === "join" ? "joined!" : "left."}`,
              snackbarSeverity: "info",
              autoHideDuration: 1500,
            }),
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
        }),
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
    fetchChunk,
  ]);

  useEffect(() => {
    setUsers([]);
  }, [authState.socketInfo.currentRoom]);

  useEffect(() => {
    setMessages([]);
    setOffset(0);
    setHasMore(true);
    fetchChunk(0);
  }, [authState.socketInfo.currentRoom, fetchChunk]);

  useEffect(
    () => () => {
      dispatch(setSocketRoom({ currentRoom: null }));
    },
    [dispatch],
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
    const info = await getUserInfo(u._id, authState.authToken);
    if (info) {
      setUserPreviewEl(elRef.current);
      setUserPreviewUser(info);
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
    s.emit(
      "delete_message",
      authState.socketInfo.currentRoom,
      selectedMessage._id,
    );
    closeMessageMenu();
  };

  const commitEditMessage = () => {
    if (!editingMessageId) return;
    const s = socketIoHelper.getSocket();
    s.emit(
      "edit_message",
      authState.socketInfo.currentRoom,
      editingMessageId,
      editingText,
    );
    setEditingMessageId(null);
    setEditingText("");
  };

  const cancelEditMessage = () => {
    setEditingMessageId(null);
    setEditingText("");
  };

  const handleLoadMore = useCallback(async () => {
    const el = listRef.current;
    if (!el || !hasMore) return;
    const prevHeight = el.scrollHeight;
    await fetchChunk(offset + CHUNK_SIZE);
    requestAnimationFrame(() => {
      el.scrollTop += el.scrollHeight - prevHeight;
    });
  }, [fetchChunk, offset, hasMore]);

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
    handleLoadMore,
    listRef,
    totalMessages,
    hasMore,
  };
}
