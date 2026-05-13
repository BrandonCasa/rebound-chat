import { Box, List } from "@mui/material";
import React, { useMemo } from "react";

import { scrollbarStyles } from "../../routes/scrollbarStyles";
import ConstructedMessages from "./ConstructedMessages";

function ChatArea({ messages, previewUser, onContextMenu, editingMessageId, editingText, setEditingText, commitEdit, cancelEdit, listRef, topSentinelRef }) {
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
		<Box sx={boxStyles} ref={listRef} data-testid="chat-message-scroll-container">
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
			<div ref={topSentinelRef} data-testid="chat-message-top-sentinel" />
		</Box>
	);
}

export default ChatArea;
