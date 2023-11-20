import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Box, Button, Divider, Paper, Stack, Typography } from "@mui/material";
import { socket } from "helpers/socket"; // Assuming socket is a default export
import UserList from "components/Chat/UserList";
import ChannelList from "components/Chat/ChannelList";
import ChatArea from "components/Chat/ChatArea";
import ChatInput from "components/Chat/ChatInput";
import { useSelector } from "react-redux";

// Constants moved outside the component, to avoid re-declaration on re-renders
const INITIAL_CHANNELS = ["General", "Tech", "Random"];
const INITIAL_CHANNEL = "General";

// Refactoring ChatBlock into a separate component file is recommended if it's used outside ChatPage.
// Memoized to prevent unnecessary re-renders
const ChatBlock = React.memo(({ title, children }) => (
  <Paper sx={{ height: "100%", width: "20%", flexGrow: 1, position: "relative" }}>
    <Typography align="center" variant="h5">
      {title}
    </Typography>
    <Divider />
    {children}
  </Paper>
));

function ChatPage() {
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState([]);
  const [channels] = useState(INITIAL_CHANNELS); // Channels array is static, no need for a setter
  const [currentChannel, setCurrentChannel] = useState(INITIAL_CHANNEL);
  const [users, setUsers] = useState([]);
  const [retrieved, setRetrieved] = useState(false);
  const authState = useSelector((state) => state.auth);

  // useCallback to memoize the function and prevent infinite loops in useEffect
  const retrieveMessages = useCallback(() => {
    socket.emit("loadMessages", messages[messages.length - 1]?.messageId, () => {});
  }, [messages]);

  // Handle socket connections and events
  useEffect(() => {
    socket.connect();

    const handleNewMessage = (message) => setMessages((prevMessages) => [...prevMessages, message]);

    const updateRoomData = ({ users }) => setUsers(users);

    const handleMessagesRetrieved = (retrievedContents) => {
      const newMessages = retrievedContents.messages.map((val) => {
        let displayedName = "";
        if (val.bot) {
          displayedName = "System";
        } else if (val.anonymous) {
          displayedName = `Anon-${val.altSenderRef.split("-")[1]}`;
        } else {
          displayedName = val.userSenderRef?.displayName || "Error";
        }

        return {
          displayName: displayedName,
          loggedIn: !!val.userSenderRef,
          messageText: val.messageContents,
          messageId: val._id,
          sendTime: val.sendTime,
          username: val.userSenderRef?.username || val.altSenderRef,
        };
      });

      setMessages((prevMessages) => [...newMessages, ...prevMessages]);
    };

    socket.on("message", handleNewMessage);
    socket.on("roomData", updateRoomData);
    socket.on("messagesRetrieved", handleMessagesRetrieved);

    return () => {
      socket.off("message", handleNewMessage);
      socket.off("roomData", updateRoomData);
      socket.off("messagesRetrieved", handleMessagesRetrieved);
      socket.disconnect();
    };
  }, []);

  useEffect(() => {
    if (messages.length === 1 && !retrieved) {
      retrieveMessages();
      setRetrieved(true);
    }
  }, [messages, retrieved, retrieveMessages]);

  // Changed to useMemo to avoid new object creation on every render
  const joinData = useMemo(
    () => ({
      loggedIn: authState.loggedIn,
      username: authState.loggedIn ? authState.username : `User-${Math.round(Math.random() * 100 + 1)}`,
      displayName: authState.loggedIn ? authState.displayName : `Anon-${Math.round(Math.random() * 100 + 1)}`,
      room: currentChannel,
    }),
    [authState, currentChannel]
  );

  useEffect(() => {
    socket.emit("join", joinData);

    return () => {
      socket.emit("leave", currentChannel, () => {
        setRetrieved(false);
      });
    };
  }, [currentChannel, joinData]);

  const sendMessage = (event) => {
    event?.preventDefault(); // Optional chaining

    if (message) {
      socket.emit("sendMessage", message, () => setMessage(""));
    }
  };

  return (
    <Box sx={{ display: "flex", justifyContent: "center", flexGrow: 1 }}>
      <Stack spacing={2} direction="row" sx={{ height: "100%", width: "100%" }}>
        <ChatBlock title="Chat Rooms">
          <ChannelList channels={channels} setCurrentChannel={setCurrentChannel} setMessages={setMessages} />
        </ChatBlock>
        <Paper sx={{ height: "100%", width: "60%", flexGrow: 1, position: "relative", display: "flex", flexDirection: "column" }}>
          <Typography align="center" variant="h5">
            {currentChannel}
          </Typography>
          <Divider />
          <Box sx={{ width: "100%", flexGrow: 1, position: "relative", mb: 1 }}>
            <ChatArea messages={messages} />
          </Box>
          <ChatInput message={message} setMessage={setMessage} sendMessage={sendMessage} />
        </Paper>
        <ChatBlock title="Room Users">
          <UserList users={users} />
        </ChatBlock>
      </Stack>
    </Box>
  );
}

export default React.memo(ChatPage); // Memoize the entire component to prevent unnecessary re-renders
