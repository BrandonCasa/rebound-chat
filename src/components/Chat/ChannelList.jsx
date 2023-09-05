import React from "react";
import { List, ListItem, ListItemText, Card } from "@mui/material";

function ChannelList({ channels, setCurrentChannel, setMessages }) {
  return (
    <List sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
      {channels.map((channel, index) => (
        <ListItem
          button
          key={index}
          onClick={() => {
            setMessages([]);
            setCurrentChannel(channel);
          }}
        >
          <ListItemText primary={channel} />
        </ListItem>
      ))}
    </List>
  );
}

export default ChannelList;
