import { Box, List, ListItem, Avatar, Typography, useTheme, Link, TextField, Button } from "@mui/material";
import React, { useMemo } from "react";

import { scrollbarStyles } from "../../routes/LandingPage/utils/scrollbarStyles";

const formatDate = (timestamp) => {
	const messageDate = new Date(timestamp);
	const today = new Date();
	const messageDateString = messageDate.toLocaleDateString();
	const todayString = today.toLocaleDateString();

	const outStringTime = messageDate.toLocaleTimeString("en-US", {
		hour: "numeric",
		minute: "2-digit",
	});
	const outStringFull = todayString === messageDateString ? `Today at ${outStringTime}` : `${messageDateString} at ${outStringTime}`;

	return outStringFull;
};

function IndividualMessage({
	msg,
	shouldDisplayAvatar,
	currentBlock,
	currentMsg,
	hoveredBlock,
	hoveredMessage,
	onHoverMessage,
	requestedTime,
	onClickMessage,
	onContextMenu,
	editingMessageId,
	editingText,
	setEditingText,
	commitEdit,
	cancelEdit,
}) {
	const theme = useTheme();
	let sendTimeText = requestedTime ? formatDate(requestedTime) : formatDate(msg.createdAt);
	const messageRef = React.useRef(null);
	const touchTimer = React.useRef(null);

	const onHoverStart = (_event) => {
		onHoverMessage(currentMsg);
	};
	const onHoverEnd = (_event) => {
		onHoverMessage(-1);
	};

	const handleContext = (e) => {
		e.preventDefault();
		onContextMenu(msg, { x: e.clientX, y: e.clientY });
	};

	const handleTouchStart = (e) => {
		const { clientX, clientY } = e.touches[0];
		touchTimer.current = setTimeout(() => onContextMenu(msg, { x: clientX, y: clientY }), 500);
	};

	const handleTouchEnd = () => {
		clearTimeout(touchTimer.current);
	};

	return (
		<ListItem
			disablePadding
			sx={{
				alignItems: "flex-start",
				display: "flex",
				flexDirection: "column",
				width: "100%",
			}}
			onContextMenu={handleContext}
			onTouchStart={handleTouchStart}
			onTouchEnd={handleTouchEnd}
		>
			<Box
				sx={{
					display: shouldDisplayAvatar ? "inherit" : "none",
					marginBottom: "-12px",
					width: "100%",
				}}
			>
				<Avatar
					alt="User"
					src={msg.sender.avatarUrl || (window.isElectron ? "defaultpfp.webp" : "/defaultpfp.webp")}
					sx={{ height: "40px", width: "40px", cursor: "pointer" }}
					onClick={() => onClickMessage(messageRef, msg.sender)}
				/>
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
					{editingMessageId === msg._id ? (
						<Box sx={{ display: "flex", gap: 1, width: "100%" }}>
							<TextField
								size="small"
								fullWidth
								value={editingText}
								onChange={(e) => setEditingText(e.target.value)}
								onKeyDown={(e) => {
									if (e.key === "Enter") commitEdit();
									if (e.key === "Escape") cancelEdit();
								}}
								autoFocus
							/>
							<Button variant="contained" color="primary" onClick={commitEdit} size="small">
								Save
							</Button>
							<Button variant="text" color="secondary" onClick={cancelEdit} size="small">
								Cancel
							</Button>
						</Box>
					) : (
						<Typography variant="subtitle1" sx={{ color: theme.palette.text.secondary }}>
							{msg.content}
						</Typography>
					)}
				</Box>
			</Box>
		</ListItem>
	);
}

const divideMessages = (messages) => {
	let outputMessages = [];

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

function GetMessageBlock({ messageBlock, blockIndex, hoveredBlock, setHoveredBlock, previewUser, onContextMenu, editingMessageId, editingText, setEditingText, commitEdit, cancelEdit }) {
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
}

const ConstructedMessages = React.memo(function ConstructedMessages({ relevantMsgs, previewUser, onContextMenu, editingMessageId, editingText, setEditingText, commitEdit, cancelEdit }) {
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
					onContextMenu={onContextMenu}
					editingMessageId={editingMessageId}
					editingText={editingText}
					setEditingText={setEditingText}
					commitEdit={commitEdit}
					cancelEdit={cancelEdit}
				/>
			</Box>
		);
	});
});

function ChatArea({ messages, previewUser, onContextMenu, editingMessageId, editingText, setEditingText, commitEdit, cancelEdit }) {
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
