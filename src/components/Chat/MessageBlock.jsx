import React from "react";
import IndividualMessage from "./IndividualMessage";

const GetMessageBlock = ({
	messageBlock,
	blockIndex,
	hoveredBlock,
	setHoveredBlock,
	previewUser,
	onContextMenu,
	editingMessageId,
	editingText,
	setEditingText,
	commitEdit,
	cancelEdit,
}) => {
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
				onContextMenu={onContextMenu}
				editingMessageId={editingMessageId}
				editingText={editingText}
				setEditingText={setEditingText}
				commitEdit={commitEdit}
				cancelEdit={cancelEdit}
			/>
		);
	});
};

export default GetMessageBlock;
