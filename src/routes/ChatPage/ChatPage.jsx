import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Box, Button, Divider, IconButton, Paper, Stack, Typography } from "@mui/material";
import socketIoHelper from "helpers/socket";
import UserList from "components/Chat/UserList";
import ChannelList from "components/Chat/ChannelList";
import ChatArea from "components/Chat/ChatArea";
import ChatInput from "components/Chat/ChatInput";
import { useDispatch, useSelector } from "react-redux";
import { setSocketRoom } from "reducers/authReducer";
import { useLocation } from "react-router-dom";
import * as Icons from "@mui/icons-material";
import ChatRoomMenu from "./ChatRoomMenu";
import UserListMenu from "./UserListMenu";

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
  const [users, setUsers] = useState([]);
  const [roomAnchorEl, setRoomAnchorEl] = React.useState(null);
  const [userListAnchorEl, setUserListAnchorEl] = React.useState(null);
  const authState = useSelector((state) => state.auth);
  const dispatch = useDispatch();

  useEffect(() => {
    const socketClient = socketIoHelper.getSocket();

    if (authState.loggedIn === true && socketClient !== null) {
      // Room List
      socketClient.on("room_list", (response) => {
        const [roomList, rooms] = response;

        setChannels(rooms);

        if (authState.socketInfo.currentRoom === null) {
          dispatch(setSocketRoom({ lastRoom: authState.socketInfo.currentRoom, currentRoom: Object.keys(roomList)[0] }));
        }
      });

      // Joined Room
      socketClient.on("joined_room", (roomId, roomMessages) => {
        setMessages(roomMessages);
      });

      // Message Sent
      socketClient.on("message_sent", (roomId, roomMessages) => {
        setMessages(roomMessages);
      });

      // New Message
      socketClient.on("new_message", (roomId, roomMessages) => {
        setMessages(roomMessages);
      });

      // User List
      socketClient.on("user_list", (roomId, roomUsers) => {
        const usersInRoom = roomUsers.map((roomUser) => {
          return roomUser;
        });
        setUsers(usersInRoom);
      });

      // Render Emits
      socketClient.emit("list_rooms");
    }

    return () => {
      const socketClient = socketIoHelper.getSocket();

      if (socketClient !== null) {
        socketClient.off("room_list");
        socketClient.off("joined_room");
        socketClient.off("message_sent");
        socketClient.off("new_message");
        socketClient.off("user_list");
        setChannels({});
        setMessage("");
        setMessages([]);
        setUsers([]);
      }
    };
  }, [authState.loggedIn, authState.socketInfo.connected]);

  useEffect(() => {
    return () => {
      setUsers([]);
    };
  }, [authState.socketInfo.currentRoom]);

  useEffect(() => {
    return () => {
      dispatch(setSocketRoom({ currentRoom: null }));
    };
  }, []);

  const sendMessage = (event) => {
    event?.preventDefault();

    if (message && authState.socketInfo.currentRoom !== null) {
      const socketClient = socketIoHelper.getSocket();
      socketClient.emit("message_room", [authState.socketInfo.currentRoom, message]);
      setMessage("");
    }
  };

  const clickRoomSelect = (event) => {
    setRoomAnchorEl(event.currentTarget);
    setUserListAnchorEl(null);
  };

  const clickUserList = (event) => {
    setUserListAnchorEl(event.currentTarget);
    setRoomAnchorEl(null);
  };

  return (
    <Box sx={{ display: "flex", justifyContent: "center", flexGrow: 1, overflow: "hidden" }}>
      <ChatRoomMenu anchorEl={roomAnchorEl} setAnchorEl={setRoomAnchorEl} channels={channels} setMessages={setMessages} />
      <UserListMenu anchorEl={userListAnchorEl} setAnchorEl={setUserListAnchorEl} users={users} />
      <Paper sx={{ height: "100%", width: "100%", flexGrow: 1, position: "relative", display: "flex", flexDirection: "column" }}>
        <Box sx={{ width: "100%", position: "relative", display: "flex", padding: 0.5, height: "48px" }}>
          <Button
            sx={{ textTransform: "initial" }}
            color="secondary"
            component="label"
            variant="outlined"
            startIcon={<Icons.MenuRounded />}
            onClick={clickRoomSelect}
          >
            <Typography align="center" variant="h6">
              {channels[authState.socketInfo.currentRoom]?.name || "No Room"}
            </Typography>
          </Button>
          <div style={{ flexGrow: 1 }} />
          <Button sx={{ textTransform: "initial" }} color="secondary" component="label" variant="outlined" endIcon={<Icons.PeopleRounded />} onClick={clickUserList}>
            <Typography align="center" variant="h6">
              {users.length}
            </Typography>
          </Button>
        </Box>
        <Divider />
        <Box sx={{ width: "100%", flexGrow: 1, position: "relative", mb: 1 }}>
          <ChatArea messages={messages} />
        </Box>
        <ChatInput message={message} setMessage={setMessage} sendMessage={sendMessage} />
      </Paper>
    </Box>
  );
}

export default React.memo(ChatPage); // Memoize the entire component to prevent unnecessary re-renders

/*
<ChatBlock title="Chat Rooms">
  <ChannelList channels={channels} setMessages={setMessages} />
</ChatBlock>

<ChatBlock title="Room Users">
  <UserList users={users} />
</ChatBlock>
*/
