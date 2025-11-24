import { Box, List } from "@mui/material";
import React, { useMemo } from "react";

import { scrollbarStyles } from "../../routes/scrollbarStyles";
import ConstructedMessages from "./ConstructedMessages";

function ChatArea({ messages, previewUser, onContextMenu, editingMessageId, editingText, setEditingText, commitEdit, cancelEdit, onScroll, listRef }) {
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
			flexDirection: "column",
			...scrollbarStyles,
		}),
		[]
	);

	React.useEffect(() => {
		console.log(listRef);
		if (listRef.current) {
			// Attach the event listener
			listRef.current.addEventListener("scrollend", onScroll);
		}

		// Cleanup function: remove the event listener when the component unmounts
		return () => {
			if (listRef.current) {
				listRef.current.removeEventListener("scrollend", onScroll);
			}
		};
	}, []);

	return (
		<Box sx={boxStyles} ref={listRef}>
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
