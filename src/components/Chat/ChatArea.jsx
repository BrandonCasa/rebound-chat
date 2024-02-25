import React, { useMemo } from "react";
import { Box, List, ListItem, ListItemAvatar, ListItemText, Avatar, Typography, Paper, useTheme, Link } from "@mui/material";
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

  return outStringFull;
};

const timeStampStyle = {
  marginLeft: "8px",
  display: "block",
  color: "gray",
  fontWeight: "normal",
  fontSize: "0.8rem",
};

function IndividualMessage({ msg, shouldDisplayAvatar, currentBlock, currentMsg, hoveredBlock, hoveredMessage, onHoverMessage, requestedTime, onClickMessage }) {
  const theme = useTheme();
  let sendTimeText = requestedTime ? formatDate(requestedTime) : formatDate(msg.createdAt);
  const messageRef = React.useRef(null);

  const onHoverStart = (event) => {
    onHoverMessage(currentMsg);
  };
  const onHoverEnd = (event) => {
    onHoverMessage(-1);
  };

  return (
    <ListItem disablePadding sx={{ alignItems: "flex-start", display: "flex", flexDirection: "column", width: "100%" }}>
      <Box sx={{ display: shouldDisplayAvatar ? "inherit" : "none", marginBottom: "-12px", width: "100%" }}>
        <Avatar alt="User" src="defaultpfp.png" sx={{ height: "40px", width: "40px" }} />
        <Link
          component={Typography}
          fontSize={20}
          sx={{
            marginLeft: 1,
            marginRight: 1,
            "&:hover": {
              cursor: "pointer",
            },
          }}
          color="inherit"
          underline="hover"
          variant="h6"
          ref={messageRef}
          onClick={() => onClickMessage(messageRef, msg.sender)}
        >
          {msg.sender.displayName}
        </Link>
        <Typography fontSize={11} sx={{ color: theme.palette.text.secondary }} variant="overline" textTransform="initial">
          {sendTimeText}
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
            paddingLeft: hoveredMessage === currentMsg && hoveredBlock === currentBlock ? 1 : 0,
            background: hoveredMessage === currentMsg && hoveredBlock === currentBlock ? `${theme.palette.text.secondary}20` : "inherit",
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

const divideMessages = (messages) => {
  let outputMessages = [];

  let previousSenderId = undefined;
  messages.forEach((message) => {
    if (message.sender["_id"] !== previousSenderId) {
      outputMessages.push([message]);
      previousSenderId = message.sender["_id"];
    } else {
      outputMessages[outputMessages.length - 1].push(message);
    }
  });

  return outputMessages;
};

function GetMessageBlock({ messageBlock, blockIndex, hoveredBlock, setHoveredBlock, previewUser }) {
  const [requestedTime, setRequestedTime] = React.useState(null);
  const [hoveredMessage, setHoveredMessage] = React.useState(-1);

  const onHoverMessage = (msgIndex) => {
    if (msgIndex !== -1) {
      setHoveredMessage(msgIndex);
      setHoveredBlock(blockIndex);
      setRequestedTime(messageBlock[msgIndex].createdAt);
    } else {
      setHoveredMessage(-1);
      setHoveredBlock(-1);
      setRequestedTime(null);
    }
  };

  return messageBlock.map((msg, msgIndex) => {
    const shouldDisplayAvatar = msgIndex === 0;

    const onClickMessage = (messageRef, user) => {
      if (shouldDisplayAvatar) {
        previewUser(messageRef, user);
      }
    };

    return (
      <IndividualMessage
        key={msgIndex}
        msg={msg}
        shouldDisplayAvatar={shouldDisplayAvatar}
        currentBlock={blockIndex}
        currentMsg={msgIndex}
        hoveredBlock={hoveredBlock}
        hoveredMessage={hoveredMessage}
        onHoverMessage={onHoverMessage}
        requestedTime={requestedTime}
        onClickMessage={onClickMessage}
      />
    );
  });
}

const ConstructedMessages = React.memo(function ConstructedMessages({ relevantMsgs, previewUser }) {
  const theme = useTheme();
  const [hoveredBlock, setHoveredBlock] = React.useState(-1);

  const dividedMessages = divideMessages(relevantMsgs);

  return dividedMessages.map((messageBlock, blockIndex) => {
    return (
      <Box
        key={blockIndex}
        sx={{
          background: hoveredBlock === blockIndex ? `${theme.palette.text.secondary}10` : "inherit",
          borderRadius: 1,
          padding: 1,
          marginBottom: blockIndex === dividedMessages.length - 1 ? 0 : 1,
          transition: `background ${hoveredBlock !== blockIndex ? "0.3s" : "0.1s"} ease-in-out`,
        }}
      >
        <GetMessageBlock
          messageBlock={messageBlock}
          blockIndex={blockIndex}
          hoveredBlock={hoveredBlock}
          setHoveredBlock={setHoveredBlock}
          previewUser={previewUser}
        />
      </Box>
    );
  });
});

function ChatArea({ messages, previewUser }) {
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
        <ConstructedMessages relevantMsgs={messages} previewUser={previewUser} />
      </List>
    </Box>
  );
}

export default ChatArea;
