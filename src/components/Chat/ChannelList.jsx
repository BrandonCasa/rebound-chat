import React from "react";
import { List, ListItem, ListItemText, Card } from "@mui/material";

function ChannelList({ channels, setCurrentChannel }) {
  return (
    <List sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
      {channels.map((channel, index) => (
        <ListItem button key={index} onClick={() => setCurrentChannel(channel)}>
          <ListItemText primary={channel} />
        </ListItem>
      ))}
    </List>
  );
}

export default ChannelList;
