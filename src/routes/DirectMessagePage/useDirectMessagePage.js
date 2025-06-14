import { useState, useEffect, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";
import { fetchDmMessages } from "../../slices/dmApiSlice";
import { fetchUserProfile } from "../../slices/userApiSlice";
import socketIoHelper from "../../helpers/socket";

export default function useDirectMessagePage(otherId) {
  const auth = useSelector((state) => state.auth);
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

  useEffect(() => {
    if (!auth.loggedIn || !otherId) return;
    dispatch(fetchUserProfile({ userId: otherId, authToken: auth.authToken }))
      .unwrap()
      .then(({ profile }) => setOtherUser(profile))
      .catch(() => {});
  }, [otherId, auth.loggedIn, auth.authToken, dispatch]);

  useEffect(() => {
    if (!auth.loggedIn || !otherId) return;
    const socket = socketIoHelper.getSocket();
    if (socket) {
      socket.emit("join_dm", otherId);
      socket.on("dm_joined", (tId, msgs) => {
        setThreadId(tId);
        setMessages(msgs);
      });
      socket.on("dm_sent", (_tId, msgs) => {
        if (_tId === threadId) setMessages(msgs);
      });
      socket.on("dm_new_message", (_tId, msgs) => {
        if (_tId === threadId) setMessages(msgs);
      });
    }
    return () => {
      if (socket) {
        socket.off("dm_joined");
        socket.off("dm_sent");
        socket.off("dm_new_message");
      }
    };
  }, [otherId, auth.loggedIn, threadId]);

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
    const s = socketIoHelper.getSocket();
    s.emit("message_dm", threadId, message);
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
    setEditingMessageId(null);
    setEditingText("");
  };

  const cancelEditMessage = () => {
    setEditingMessageId(null);
    setEditingText("");
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
    startEditSelectedMessage,
    commitEditMessage,
    cancelEditMessage,
    listRef,
  };
}
