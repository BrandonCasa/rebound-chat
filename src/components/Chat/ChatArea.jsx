import { Box, List } from "@mui/material";
import React, { useMemo } from "react";

import { scrollbarStyles } from "../../routes/LandingPage/utils/scrollbarStyles";
import ConstructedMessages from "./ConstructedMessages";

function ChatArea({
  messages,
  previewUser,
  onContextMenu,
  editingMessageId,
  editingText,
  setEditingText,
  commitEdit,
  cancelEdit,
  onScroll,
  listRef,
}) {
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
    [],
  );

  return (
    <Box sx={boxStyles} onScroll={onScroll} ref={listRef}>
      <List disablePadding>
        <ConstructedMessages
          relevantMsgs={messages}
          previewUser={previewUser}
          onContextMenu={onContextMenu}
          editingMessageId={editingMessageId}
          editingText={editingText}
          setEditingText={setEditingText}
          commitEdit={commitEdit}
          cancelEdit={cancelEdit}
        />
      </List>
    </Box>
  );
}

export default ChatArea;
