import React from "react";
import { List, ListItem, ListItemAvatar, ListItemText, Avatar, Card } from "@mui/material";

function ChatArea({ messages }) {
  return (
    <Card>
      <List>
        {messages.map((msg, index) => (
          <ListItem key={index}>
            <ListItemAvatar>
              <Avatar />
            </ListItemAvatar>
            <ListItemText primary={msg.text} secondary={msg.user} />
          </ListItem>
        ))}
      </List>
    </Card>
  );
}

export default ChatArea;
