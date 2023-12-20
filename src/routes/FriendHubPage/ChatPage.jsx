import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Box, Button, Divider, Paper, Stack, Typography } from "@mui/material";
import socketIoHelper from "helpers/socket";
import UserList from "components/Chat/UserList";
import ChannelList from "components/Chat/ChannelList";
import ChatArea from "components/Chat/ChatArea";
import ChatInput from "components/Chat/ChatInput";
import { useSelector } from "react-redux";

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
  const [channels, setChannels] = useState([]);
  const [currentChannel, setCurrentChannel] = useState(null);
  const [users, setUsers] = useState([]);
  const authState = useSelector((state) => state.auth);

  useEffect(() => {
    if (authState.loggedIn === true && socketIoHelper.getSocket() !== null) {
      socketIoHelper.getSocket().on("room_list", (roomList) => {
        console.log(roomList);
      });

      socketIoHelper.getSocket().emit("list_rooms");
    }

    return () => {
      socketIoHelper.getSocket().off("room_list");
    };
  }, []);

  const sendMessage = (event) => {
    event?.preventDefault();

    if (message) {
      //socket.emit("sendMessage", message, () => setMessage(""));
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
