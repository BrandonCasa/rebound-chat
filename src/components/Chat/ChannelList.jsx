import React from "react";
import { List, ListItem, ListItemText, Card } from "@mui/material";

function ChannelList({ channels, setCurrentChannel }) {
  return (
    <Card>
      <List>
        {channels.map((channel, index) => (
          <ListItem button key={index} onClick={() => setCurrentChannel(channel)}>
            <ListItemText primary={channel} />
          </ListItem>
        ))}
      </List>
    </Card>
  );
}

export default ChannelList;
