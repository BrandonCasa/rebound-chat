import React, { useState, useEffect } from "react";
import { Grid } from "@mui/material";
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

    socket.emit("join", { username: "User1", room: currentChannel });

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
    event.preventDefault();

    if (message) {
      socket.emit("sendMessage", message, () => setMessage(""));
    }
  };

  return (
    <Grid container spacing={2}>
      <Grid item xs={2}>
        <ChannelList channels={channels} setCurrentChannel={setCurrentChannel} />
      </Grid>
      <Grid item xs={8}>
        <ChatArea messages={messages} />
        <ChatInput message={message} setMessage={setMessage} sendMessage={sendMessage} />
      </Grid>
      <Grid item xs={2}>
        <UserList users={users} />
      </Grid>
    </Grid>
  );
}

export default ChatPage;
