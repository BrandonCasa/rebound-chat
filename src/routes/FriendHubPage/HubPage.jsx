import { Box, Divider, List, ListItem, ListItemButton, ListItemText, ListSubheader, Paper, Stack, Typography } from "@mui/material";
import { styled } from "@mui/material/styles";
import Grid from "@mui/material/Unstable_Grid2";
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

const Item = styled(Paper)(({ theme }) => ({
  ...theme.typography.body2,
  padding: theme.spacing(1),
  textAlign: "center",
  color: theme.palette.text.secondary,
}));

function HubPage() {
  const [currentChatRoom, setCurrentChatRoom] = React.useState("none");

  return (
    <Box sx={{ flexGrow: 1, display: "flex" }}>
      <Grid container spacing={2} sx={{ flexGrow: 1 }}>
        <Grid xs={12} sm={4.75} md={3} sx={{ height: "100%" }}>
          <ChatList currentChatRoom={currentChatRoom} setCurrentChatRoom={setCurrentChatRoom} />
        </Grid>
        <Grid sm={7.25} md={9}>
          <Item sx={{ height: "100%" }}>{currentChatRoom}</Item>
        </Grid>
      </Grid>
    </Box>
  );
}

export default HubPage;
