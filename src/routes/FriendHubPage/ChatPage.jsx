import React, { useState, useEffect } from "react";
import { Box, Divider, Grid, Paper, Typography } from "@mui/material";
import { socket } from "helpers/socket";
import UserList from "components/Chat/UserList";
import ChannelList from "components/Chat/ChannelList";
import ChatArea from "components/Chat/ChatArea";
import ChatInput from "components/Chat/ChatInput";

function ChatPage() {
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState([]);
  const [channels, setChannels] = useState(["General", "Tech", "Random"]);
  const [currentChannel, setCurrentChannel] = useState("General");
  const [users, setUsers] = useState([]);

  useEffect(() => {
    socket.connect();

    socket.emit("join", { username: `Users${Math.round(Math.random() * 10000 + 1)}`, room: currentChannel });

    socket.on("message", (message) => {
      setMessages((messages) => [...messages, message]);
    });

    socket.on("roomData", ({ users }) => {
      setUsers(users);
    });

    return () => {
      socket.disconnect();
    };
  }, [currentChannel]);

  const sendMessage = (event) => {
    if (event) event.preventDefault();

    if (message) {
      socket.emit("sendMessage", message, () => setMessage(""));
    }
  };

  return (
    <Box sx={{ display: "flex", justifyContent: "center", flexGrow: 1 }}>
      <Grid container spacing={2}>
        <Grid item xs={2}>
          <Paper sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
            <Typography align="center" variant="h5">
              Chat Rooms
            </Typography>
            <Divider />
            <ChannelList channels={channels} setCurrentChannel={setCurrentChannel} />
          </Paper>
        </Grid>
        <Grid item xs={8} sx={{ height: "100%" }}>
          <Paper sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
            <Typography align="center" variant="h5">
              {currentChannel}
            </Typography>
            <Divider />
            <ChatArea messages={messages} />
            <ChatInput message={message} setMessage={setMessage} sendMessage={sendMessage} />
          </Paper>
        </Grid>
        <Grid item xs={2}>
          <Paper sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
            <Typography align="center" variant="h5">
              Room Users
            </Typography>
            <Divider />
            <UserList users={users} />
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
}

export default ChatPage;
