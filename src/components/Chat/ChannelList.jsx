import React from "react";
import { List, ListItem, ListItemText, Card, ListItemButton } from "@mui/material";

function ChannelList({ channels, currentChannel, setCurrentChannel, setMessages }) {
  return (
    <List sx={{ display: "flex", flexDirection: "column" }}>
      {Object.keys(channels).map((channel) => (
        <ListItemButton
          key={channel}
          selected={currentChannel === channel}
          onClick={() => {
            setMessages([]);
            setCurrentChannel(channel);
          }}
        >
          <ListItemText primary={channels[channel].name} />
        </ListItemButton>
      ))}
    </List>
  );
}

export default ChannelList;
