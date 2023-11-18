import React, { useState, memo } from "react";
import { Box, List, ListItem, ListItemAvatar, ListItemText, Avatar, IconButton, Menu, MenuItem } from "@mui/material";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import { scrollbarStyles } from "routes/LandingPage/utils/scrollbarStyles";
import { isMobile, isSafari } from "react-device-detect";

const styles = {
  arrowBox: {
    paddingLeft: "56px",
  },
};

const ConstructedMessages = memo(function ConstructedMessages({ relevantMsgs, editMessage, deleteMessage }) {
  // console.log(relevantMsgs);
  let lastSender = null;

  return relevantMsgs.map((msg, index) => {
    const shouldDisplayAvatar = lastSender !== msg.displayName;
    lastSender = msg.displayName;

    return (
      <ListItem key={index} disablePadding>
        {shouldDisplayAvatar && (
          <ListItemAvatar>
            <Avatar>{msg.loggedIn ? msg.displayName[0] : msg.displayName.split("-")[1]}</Avatar>
          </ListItemAvatar>
        )}
        <ListItemText primary={shouldDisplayAvatar ? msg.displayName : ""} secondary={msg.messageText} sx={shouldDisplayAvatar ? {} : styles.arrowBox} />
      </ListItem>
    );
  });
});

function ChatArea({ messages, editMessage, deleteMessage }) {
  return (
    <Box
      sx={{
        position: "absolute",
        left: "0px",
        top: "0px",
        right: "0px",
        bottom: "0px",
        overflowX: "hidden",
        overflowY: "auto",
        padding: 1,
        display: "flex",
        flexDirection: "column-reverse",
        ...scrollbarStyles,
      }}
    >
      <List disablePadding>
        <ConstructedMessages relevantMsgs={messages} editMessage={editMessage} deleteMessage={deleteMessage} />
      </List>
    </Box>
  );
}

export default ChatArea;
