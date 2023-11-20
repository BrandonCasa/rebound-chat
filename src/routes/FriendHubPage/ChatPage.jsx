import React, { useState, useEffect } from "react";
import { Box, Button, Divider, Paper, Stack, Typography } from "@mui/material";
import { socket } from "helpers/socket";
import UserList from "components/Chat/UserList";
import ChannelList from "components/Chat/ChannelList";
import ChatArea from "components/Chat/ChatArea";
import ChatInput from "components/Chat/ChatInput";
import { useSelector } from "react-redux";

// Defined Constants
const INITIAL_CHANNELS = ["General", "Tech", "Random"];
const INITIAL_CHANNEL = "General";

// Sub-component ChatBlock
const ChatBlock = ({ title, children }) => (
  <Paper sx={{ height: "100%", width: "20%", flexGrow: 1, position: "relative" }}>
    <Typography align="center" variant="h5">
      {title}
    </Typography>
    <Divider />
    {children}
  </Paper>
);

function ChatPage() {
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState([]);
  const [channels, setChannels] = useState(INITIAL_CHANNELS);
  const [currentChannel, setCurrentChannel] = useState(INITIAL_CHANNEL);
  const [users, setUsers] = useState([]);

  const [retrieved, setRetrieved] = useState(false);

  const authState = useSelector((state) => state.auth);

  const retrieveMessages = () => {
    socket.emit("loadMessages", messages[messages.length - 1].messageId, () => {});
  };

  useEffect(() => {
    socket.connect();

    socket.on("message", (message) => {
      setMessages((messages) => [...messages, ...[message]]);
    });

    socket.on("roomData", ({ users }) => {
      setUsers(users);
    });

    socket.on("messagesRetrieved", (retrievedContents) => {
      let newMessages = [];

      retrievedContents.messages.forEach((val, ind) => {
        if (val.userSenderRef !== undefined) {
          newMessages.push({
            displayName: val.userSenderRef.displayName,
            loggedIn: true,
            messageText: val.messageContents,
            messageId: val._id,
            username: val.userSenderRef.username,
          });
        } else {
          newMessages.push({
            displayName: val.bot ? "System" : `Anon-${val.altSenderRef.split("-")[1]}`,
            loggedIn: false,
            messageText: val.messageContents,
            messageId: val._id,
            username: val.altSenderRef.username,
          });
        }
      });

      setMessages((messages) => {
        return [...newMessages, ...messages];
      });
    });

    //retrieveMessages();

    return () => {
      socket.off("message");
      socket.off("roomData");
      socket.off("messagesRetrieved");
      socket.disconnect();
    };
  }, []);

  useEffect(() => {
    if (messages.length === 1 && !retrieved) {
      retrieveMessages();
      setRetrieved(true);
    }
    return () => {};
  }, [messages]);

  useEffect(() => {
    let randomId = Math.round(Math.random() * 100 + 1);

    socket.emit("join", {
      loggedIn: authState.loggedIn,
      username: authState.loggedIn ? authState.username : `User-${randomId}`,
      displayName: authState.loggedIn ? authState.displayName : `Anon-${randomId}`,
      room: currentChannel,
    });

    return () => {
      socket.emit("leave", currentChannel, () => {
        setRetrieved(false);
      });
    };
  }, [currentChannel, authState.loggedIn]);

  const sendMessage = (event) => {
    if (event) event.preventDefault();

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

export default ChatPage;
