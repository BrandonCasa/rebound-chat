import React from "react";
import { useParams } from "react-router-dom";
import { Box, Divider, Paper, Typography } from "@mui/material";
import ChatArea from "../../components/Chat/ChatArea";
import ChatInput from "../../components/Chat/ChatInput";
import MessageContextMenu from "../../components/Chat/MessageContextMenu";
import useDirectMessagePage from "./useDirectMessagePage";

export default function DirectMessagePage() {
  const { userId } = useParams();
  const {
    auth,
    otherUser,
    message,
    setMessage,
    messages,
    editingMessageId,
    editingText,
    setEditingText,
    sendMessage,
    msgMenuPos,
    openMessageMenu,
    closeMessageMenu,
    startEditSelectedMessage,
    commitEditMessage,
    cancelEditMessage,
    listRef,
  } = useDirectMessagePage(userId);

  if (!auth.loggedIn) return <Typography>Please login.</Typography>;

  return (
    <Box sx={{ display: "flex", flexGrow: 1, flexDirection: "column", overflow: "hidden" }}>
      <MessageContextMenu
        anchorPosition={msgMenuPos}
        setAnchorPosition={closeMessageMenu}
        onEdit={startEditSelectedMessage}
        onDelete={() => {}}
        allowEdit={true}
      />
      <Paper sx={{ position: "relative", display: "flex", flexDirection: "column", width: "100%", flexGrow: 1 }}>
        <Box sx={{ p: 1 }}>
          <Typography variant="h6">{otherUser?.displayName || "DM"}</Typography>
        </Box>
        <Divider />
        <Box sx={{ flexGrow: 1, position: "relative", width: "100%" }}>
          <ChatArea
            messages={messages}
            previewUser={() => {}}
            onContextMenu={openMessageMenu}
            editingMessageId={editingMessageId}
            editingText={editingText}
            setEditingText={setEditingText}
            commitEdit={commitEditMessage}
            cancelEdit={cancelEditMessage}
            listRef={listRef}
          />
        </Box>
        <ChatInput message={message} setMessage={setMessage} sendMessage={sendMessage} />
      </Paper>
    </Box>
  );
}
