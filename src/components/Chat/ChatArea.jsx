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
  onLoadMore,
  listRef,
}) {
  const boxStyles = useMemo(
    () => ({
      position: "absolute",
      inset: 0,
      overflowX: "hidden",
      overflowY: "auto",
      padding: 1,
      display: "flex",
      flexDirection: "column",
      ...scrollbarStyles,
    }),
    [],
  );

  const topSentinel = React.useRef(null);

  React.useEffect(() => {
    const el = listRef.current;
    if (!el || !topSentinel.current) return;
    if (typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) onLoadMore();
      },
      { root: el, threshold: 0 },
    );
    observer.observe(topSentinel.current);
    return () => observer.disconnect();
  }, [onLoadMore, listRef]);

  React.useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight <= 5) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages.length, listRef]);

  return (
    <Box sx={boxStyles} ref={listRef}>
      <div ref={topSentinel} />
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
