import React, { useState, memo } from "react";
import { Box, List, ListItem, ListItemAvatar, ListItemText, Avatar, IconButton, Menu, MenuItem } from "@mui/material";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import { scrollbarStyles } from "routes/LandingPage/utils/scrollbarStyles";

const styles = {
  arrowBox: {
    paddingLeft: "56px",
  },
};

const ConstructedMessages = memo(function ConstructedMessages({ relevantMsgs, editMessage, deleteMessage }) {
  let lastSender = null;

  return relevantMsgs.map((msg, index) => {
    const shouldDisplayAvatar = lastSender !== msg.user;
    lastSender = msg.user;

    return (
      <ListItem key={msg.id} disablePadding>
        {shouldDisplayAvatar && (
          <ListItemAvatar>
            <Avatar>{msg.user[0]}</Avatar>
          </ListItemAvatar>
        )}
        <ListItemText primary={shouldDisplayAvatar ? msg.user : ""} secondary={msg.text} sx={shouldDisplayAvatar ? {} : styles.arrowBox} />
      </ListItem>
    );
  });
});

function ChatArea({ messages, editMessage, deleteMessage }) {
  return (
    <Box
      sx={{
        overflowX: "hidden",
        overflowY: "auto",
        padding: 1,
        flexGrow: 1,
        display: "flex",
        flexDirection: "column-reverse",
        ...scrollbarStyles,
      }}
    >
      <List disablePadding sx={{ height: "100%" }}>
        <ConstructedMessages relevantMsgs={messages} editMessage={editMessage} deleteMessage={deleteMessage} />
      </List>
    </Box>
  );
}

export default ChatArea;
