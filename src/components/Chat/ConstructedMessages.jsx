import React from "react";
import { Box, useTheme } from "@mui/material";
import GetMessageBlock from "./MessageBlock";

const divideMessages = (messages) => {
	const outputMessages = [];
	let previousSenderId = undefined;
	messages.forEach((message) => {
		if (message?.sender?._id === undefined) {
			return;
		}

		if (message.sender["_id"] !== previousSenderId) {
			outputMessages.push([message]);
			previousSenderId = message.sender["_id"];
		} else {
			outputMessages[outputMessages.length - 1].push(message);
		}
	});

	return outputMessages;
};

const ConstructedMessages = React.memo(function ConstructedMessages({
	relevantMsgs,
	previewUser,
	onContextMenu,
	editingMessageId,
	editingText,
	setEditingText,
	commitEdit,
	cancelEdit,
}) {
	const theme = useTheme();
	const [hoveredBlock, setHoveredBlock] = React.useState(-1);

	const dividedMessages = divideMessages(relevantMsgs);

	return dividedMessages.map((messageBlock, blockIndex) => (
		<Box
			key={blockIndex}
			sx={{
				background: hoveredBlock === blockIndex ? `${theme.palette.text.secondary}10` : "inherit",
				borderRadius: 1,
				padding: 1,
				marginBottom: blockIndex === dividedMessages.length - 1 ? 0 : 1,
				transition: `background ${hoveredBlock !== blockIndex ? "0.3s" : "0.1s"} ease-in-out`,
			}}>
			<GetMessageBlock
				messageBlock={messageBlock}
				blockIndex={blockIndex}
				hoveredBlock={hoveredBlock}
				setHoveredBlock={setHoveredBlock}
				previewUser={previewUser}
				onContextMenu={onContextMenu}
				editingMessageId={editingMessageId}
				editingText={editingText}
				setEditingText={setEditingText}
				commitEdit={commitEdit}
				cancelEdit={cancelEdit}
			/>
		</Box>
	));
});

export default ConstructedMessages;
