import React, { useState, memo, Component } from "react";
import { Box, List, ListItem, ListItemAvatar, ListItemText, Avatar, IconButton, Menu, MenuItem } from "@mui/material";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import SecurityIcon from "@mui/icons-material/Security";
import UserIcon from "@mui/icons-material/Person";
import AnonIcon from "@mui/icons-material/QuestionMark";
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

  const avatarIcons = {
    system: SecurityIcon,
    user: UserIcon,
    anon: AnonIcon,
  };

  return relevantMsgs.map((msg, index) => {
    const shouldDisplayAvatar = lastSender !== msg.displayName;
    lastSender = msg.displayName;

    let avatar = "";
    let displayedName = "";

    if (msg.username === "System") {
      avatar = "system";
      displayedName = "System";
    } else if (msg.loggedIn) {
      avatar = "user";
      displayedName = msg.displayName;
    } else {
      avatar = "anon";
      displayedName = msg.displayName;
    }

    const AvatarIcon = avatarIcons[avatar];

    return (
      <ListItem key={index} disablePadding>
        {shouldDisplayAvatar && (
          <ListItemAvatar>
            <Avatar>
              <AvatarIcon />
            </Avatar>
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
