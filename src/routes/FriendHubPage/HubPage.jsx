import { Divider, Grid, List, ListItem, ListItemButton, ListItemText, ListSubheader, Paper, Stack, Typography } from "@mui/material";
import ChannelList from "components/Chat/ChannelList";
import ChatArea from "components/Chat/ChatArea";
import ChatInput from "components/Chat/ChatInput";
import UserList from "components/Chat/UserList";
import React from "react";

function ChatList({ currentChatRoom, setCurrentChatRoom }) {
  return (
    <Paper
      sx={{
        width: "100%",
        height: "100%",
        overflow: "scroll",
        flexGrow: 1,
        minHeight: "175px",
      }}
    >
      <List
        sx={{
          width: "100%",
          height: "100%",
          bgcolor: "background.paper",
          flexGrow: 1,
          "& ul": { padding: 0 },
        }}
        subheader={<li />}
      >
        {["Favorites", "Overwatch", "Valorant"].map((chatGroup) => (
          <li key={`group-${chatGroup}`}>
            <ul>
              <ListSubheader>{`${chatGroup}`}</ListSubheader>
              {["phantompigz", "future_wizard", "Ranahan"].map((chatName) => (
                <ListItemButton
                  selected={chatName == currentChatRoom}
                  disabled={chatName == currentChatRoom}
                  key={`chat-${chatGroup}-${chatName}`}
                  onClick={() => {
                    setCurrentChatRoom(chatName);
                  }}
                >
                  <ListItemText sx={{ ml: 3 }} primary={`${chatName}`} />
                </ListItemButton>
              ))}
            </ul>
          </li>
        ))}
      </List>
    </Paper>
  );
}

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

function HubPage() {
  const [currentChatRoom, setCurrentChatRoom] = React.useState("none");

  return (
    <Grid container spacing={2} sx={{ justifyContent: "center", display: "flex", overflow: "hidden" }} rowGap={10000}>
      <Grid item xs={12} sm={4.75} md={3} display="flex" sx={{ overflow: "hidden", height: "100%" }}>
        <ChatList currentChatRoom={currentChatRoom} setCurrentChatRoom={setCurrentChatRoom} />
      </Grid>
      <Grid item xs={false} sm={7.25} md={9} display="flex" sx={{ overflow: "hidden", height: "100%" }}>
        <Paper sx={{ height: "100%", width: "100%" }}>
          {currentChatRoom}
          <Stack spacing={2} direction="row" sx={{ height: "100%", width: "100%" }}>
            <ChatBlock title="Chat Rooms">
              <ChannelList channels={channels} setCurrentChannel={setCurrentChannel} />
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
          </Stack>
        </Paper>
      </Grid>
    </Grid>
  );
}

export default HubPage;
