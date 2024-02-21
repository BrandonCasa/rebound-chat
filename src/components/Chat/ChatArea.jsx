import React, { useMemo } from "react";
import { Box, List, ListItem, ListItemAvatar, ListItemText, Avatar, Typography, Paper, useTheme } from "@mui/material";
import SecurityIcon from "@mui/icons-material/Security";
import UserIcon from "@mui/icons-material/Person";
import AnonIcon from "@mui/icons-material/QuestionMark";
import { scrollbarStyles } from "routes/LandingPage/utils/scrollbarStyles";

const formatDate = (timestamp) => {
  const messageDate = new Date(timestamp);
  const today = new Date();
  const messageDateString = messageDate.toLocaleDateString();
  const todayString = today.toLocaleDateString();

  const outStringTime = messageDate.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const outStringFull = todayString === messageDateString ? `Today at ${outStringTime}` : `${messageDateString} at ${outStringTime}`;

  return [outStringFull, outStringTime];
};

const timeStampStyle = {
  marginLeft: "8px",
  display: "block",
  color: "gray",
  fontWeight: "normal",
  fontSize: "0.8rem",
};

function IndividualMessage({ msg, shouldDisplayAvatar }) {
  const theme = useTheme();
  const [sendTimeFull, sendTimeTime] = formatDate(msg.createdAt);
  const [isHovered, setIsHovered] = React.useState(false);

  const onHoverStart = (event) => {
    setIsHovered(true);
  };
  const onHoverEnd = (event) => {
    setIsHovered(false);
  };

  return (
    <ListItem disablePadding sx={{ alignItems: "flex-start", display: "flex", flexDirection: "column", width: "100%" }}>
      <Box sx={{ display: shouldDisplayAvatar ? "inherit" : "none", marginBottom: "-12px", width: "100%" }}>
        <Avatar alt="User" src="defaultpfp.png" sx={{ height: "40px", width: "40px" }} />
        <Typography fontSize={20} sx={{ marginLeft: 1, marginRight: 1 }} variant="h6">
          {msg.sender.displayName}
        </Typography>
        <Typography fontSize={11} sx={{ color: theme.palette.text.secondary }} variant="overline" textTransform="initial">
          {sendTimeFull}
        </Typography>
      </Box>
      <Box
        sx={{
          width: "100%",
          paddingLeft: "48px",
        }}
        onMouseEnter={onHoverStart}
        onMouseLeave={onHoverEnd}
      >
        <Box
          sx={{
            paddingLeft: isHovered ? 1 : 0,
            background: isHovered ? `${theme.palette.text.secondary}20` : "inherit",
            borderRadius: 1,
            transition: "padding-left 0.1s ease-in-out, background 0.05s ease-in-out",
            display: "flex",
            justifyContent: "space-between",
          }}
        >
          <Typography variant="subtitle1" sx={{ color: theme.palette.text.secondary }}>
            {msg.content}
          </Typography>
        </Box>
      </Box>
    </ListItem>
  );
}
const ConstructedMessages = React.memo(function ConstructedMessages({ relevantMsgs }) {
  let lastSender = null;

  return relevantMsgs.map((msg) => {
    const shouldDisplayAvatar = lastSender !== msg.sender.displayName;
    lastSender = msg.sender.displayName;

    return <IndividualMessage key={msg.id || msg.createdAt} msg={msg} shouldDisplayAvatar={shouldDisplayAvatar} />;
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
