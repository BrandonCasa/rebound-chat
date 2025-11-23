import { Box, ListItem, Avatar, Typography, useTheme, Link, TextField, Button } from "@mui/material";
import { scrollbarStyles } from "../../routes/scrollbarStyles";
import React from "react";
import useLongPress from "../../helpers/useLongPress";
import { highlightMentions } from "../../helpers/mentions";
import { profileMediaUrl } from "../../helpers/mediaUrl";

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
	const longPressHandlers = useLongPress(({ x, y }) => onContextMenu(msg, { x, y }));

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
			{...longPressHandlers}>
			<Box
				sx={{
					display: shouldDisplayAvatar ? "inherit" : "none",
					marginBottom: "-12px",
					width: "100%",
				}}>
				<Avatar
					alt="User"
					src={profileMediaUrl(msg.sender.avatarUrl, "defaultpfp.webp")}
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
					onClick={() => onClickMessage(messageRef, msg.sender)}>
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
				onMouseLeave={onHoverEnd}>
				<Box
					sx={{
						paddingLeft: hoveredMessage === currentMsg && hoveredBlock === currentBlock && editingMessageId !== msg._id ? 1 : 0,
						background:
							(hoveredMessage === currentMsg && hoveredBlock === currentBlock) || editingMessageId === msg._id
								? `${theme.palette.text.secondary}20`
								: "inherit",
						borderRadius: 1,
						transition: "padding-left 0.1s ease-in-out, background 0.05s ease-in-out",
						display: "flex",
						justifyContent: "space-between",
					}}>
					{editingMessageId === msg._id ? (
						<Box sx={{ display: "flex", gap: 1, width: "100%", justifyContent: "space-between", alignItems: "center", padding: 1 }}>
							<TextField
								size="small"
								fullWidth
								multiline
								maxRows={8}
								value={editingText}
								onChange={(e) => setEditingText(e.target.value)}
								onKeyDown={(e) => {
									if (e.key === "Enter") commitEdit();
									if (e.key === "Escape") cancelEdit();
								}}
								autoFocus
								sx={{
									"& .MuiInputBase-inputMultiline": { ...scrollbarStyles },
								}}
							/>
							<Button variant="contained" color="primary" onClick={commitEdit} size="small" sx={{ maxHeight: "2rem" }}>
								Save
							</Button>
							<Button variant="outlined" color="secondary" onClick={cancelEdit} size="small" sx={{ maxHeight: "2rem" }}>
								Cancel
							</Button>
						</Box>
					) : (
						<Typography variant="subtitle1" sx={{ color: theme.palette.text.secondary }}>
							{highlightMentions(msg.content, msg.mentions || []).map((p) => (
								<span
									key={p.key}
									style={
										p.mention
											? { backgroundColor: `${theme.palette.warning.main}80`, color: theme.palette.common.white, borderRadius: 4, padding: "0 2px" }
											: {}
									}>
									{p.text}
								</span>
							))}
						</Typography>
					)}
				</Box>
			</Box>
		</ListItem>
	);
}

export default IndividualMessage;
