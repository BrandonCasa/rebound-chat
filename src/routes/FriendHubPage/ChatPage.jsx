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
  const [channels, setChannels] = useState({});
  const [currentChannel, setCurrentChannel] = useState(null);
  const [users, setUsers] = useState([]);
  const authState = useSelector((state) => state.auth);

  useEffect(() => {
    // Logged In Listeners
    if (authState.loggedIn === true && socketIoHelper.getSocket() !== null) {
      // Room List
      const socketClient = socketIoHelper.getSocket();
      socketClient.on("room_list", (response) => {
        const [roomList, rooms] = response;

        setChannels(rooms);

        if (currentChannel === null) {
          setCurrentChannel(Object.keys(roomList)[0]);
        }
      });
      // Joined Room
      socketClient.on("joined_room", (roomId, roomMessages) => {
        console.log(roomMessages);
      });

      socketClient.emit("list_rooms");
    }
    // Logged Out Listeners
    if (authState.loggedIn === false && socketIoHelper.getSocket() !== null) {
    }
    // Logged In or Out Listeners
    if (socketIoHelper.getSocket() !== null) {
    }

    return () => {
      if (socketIoHelper.getSocket() !== null) {
        socketIoHelper.getSocket().off("room_list");
      }
    };
  }, [authState.loggedIn, authState.socketConnected]);

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
          <ChannelList channels={channels} currentChannel={currentChannel} setCurrentChannel={setCurrentChannel} setMessages={setMessages} />
        </ChatBlock>
        <Paper sx={{ height: "100%", width: "60%", flexGrow: 1, position: "relative", display: "flex", flexDirection: "column" }}>
          <Typography align="center" variant="h5">
            - {channels[currentChannel]?.name} -
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
