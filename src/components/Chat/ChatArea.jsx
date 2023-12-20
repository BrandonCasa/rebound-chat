import React, { useMemo } from "react";
import { Box, List, ListItem, ListItemAvatar, ListItemText, Avatar, Typography } from "@mui/material";
import SecurityIcon from "@mui/icons-material/Security";
import UserIcon from "@mui/icons-material/Person";
import AnonIcon from "@mui/icons-material/QuestionMark";
import { scrollbarStyles } from "routes/LandingPage/utils/scrollbarStyles";

const avatarIcons = {
  system: SecurityIcon,
  user: UserIcon,
  anon: AnonIcon,
};

const getAvatarIcon = (msg) => {
  if (msg.username === "System") {
    return avatarIcons.system;
  } else if (msg.loggedIn) {
    return avatarIcons.user;
  } else {
    return avatarIcons.anon;
  }
};

const formatDate = (timestamp) => {
  const messageDate = new Date(timestamp);
  const today = new Date();
  const messageDateString = messageDate.toLocaleDateString();
  const todayString = today.toLocaleDateString();
  const timeString = messageDate.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

  return todayString === messageDateString ? `Today at ${timeString}` : `${messageDateString} at ${timeString}`;
};

const timeStampStyle = {
  marginLeft: "8px",
  display: "block",
  color: "gray",
  fontWeight: "normal",
  fontSize: "0.8rem",
};

const ConstructedMessages = React.memo(function ConstructedMessages({ relevantMsgs }) {
  let lastSender = null;

  return relevantMsgs.map((msg) => {
    const shouldDisplayAvatar = lastSender !== msg.sender.displayName;
    lastSender = msg.sender.displayName;
    const AvatarIcon = getAvatarIcon(msg);
    const sendTimeFormatted = formatDate(msg.createdAt);

    return (
      <ListItem key={msg.id || msg.createdAt} disablePadding sx={{ alignItems: "flex-start" }}>
        {shouldDisplayAvatar && (
          <ListItemAvatar>
            <Avatar>
              <AvatarIcon />
            </Avatar>
          </ListItemAvatar>
        )}
        <ListItemText
          primary={
            shouldDisplayAvatar && (
              <>
                <Typography component="span" style={{ display: "inline-block" }}>
                  {msg.sender.displayName}
                </Typography>
                <Typography component="span" style={{ display: "inline-block" }} sx={timeStampStyle}>
                  {sendTimeFormatted}
                </Typography>
              </>
            )
          }
          secondary={msg.content}
          sx={{ paddingLeft: shouldDisplayAvatar ? "" : "56px", marginTop: "4px" }} // Adjust paddingLeft based on avatar display
        />
      </ListItem>
    );
  });
});

function ChatArea({ messages }) {
  const boxStyles = useMemo(
    () => ({
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
    }),
    []
  );

  return (
    <Box sx={boxStyles}>
      <List disablePadding>
        <ConstructedMessages relevantMsgs={messages} />
      </List>
    </Box>
  );
}

export default ChatArea;
