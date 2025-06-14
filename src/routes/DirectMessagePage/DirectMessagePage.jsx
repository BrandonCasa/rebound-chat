import React from "react";
import { useParams } from "react-router-dom";
import { Box, Divider, IconButton, Paper, Popover, Typography } from "@mui/material";
import ChatArea from "../../components/Chat/ChatArea";
import ChatInput from "../../components/Chat/ChatInput";
import MessageContextMenu from "../../components/Chat/MessageContextMenu";
import useDirectMessagePage from "./useDirectMessagePage";
import AccountCircleRounded from "@mui/icons-material/AccountCircleRounded";
import Avatar from "@mui/material/Avatar";
import ProfileCard from "../../components/User/ProfileCard";

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
		selectedMessage,
		startEditSelectedMessage,
		confirmDeleteSelectedMessage,
		commitEditMessage,
		cancelEditMessage,
		listRef,
		userPreviewEl,
		setUserPreviewEl,
		previewMe,
		setPreviewMe,
		previewUser,
	} = useDirectMessagePage(userId);

	if (!auth.loggedIn) return <Typography>Please login.</Typography>;

	const pfpRef = React.useRef(null);

	return (
		<Box sx={{ display: "flex", flexGrow: 1, flexDirection: "column", overflow: "hidden" }}>
			<MessageContextMenu
				anchorPosition={msgMenuPos}
				setAnchorPosition={closeMessageMenu}
				onEdit={startEditSelectedMessage}
				onDelete={confirmDeleteSelectedMessage}
				allowEdit={selectedMessage?.sender?._id === auth.userId}
			/>
			<Popover
				anchorOrigin={{ vertical: "top", horizontal: "right" }}
				transformOrigin={{ vertical: "bottom", horizontal: "left" }}
				anchorEl={userPreviewEl}
				open={Boolean(userPreviewEl)}
				onClose={() => {
					setUserPreviewEl(null);
				}}
				sx={{ mb: 2 }}>
				<ProfileCard self={previewMe} user={otherUser} width="300px" passStyle={{ maxWidth: "300px" }} />
			</Popover>
			<Paper sx={{ position: "relative", display: "flex", flexDirection: "column", width: "100%", flexGrow: 1 }}>
				<Box sx={{ p: 1, display: "flex", alignItems: "center", gap: 2 }}>
					<IconButton
						color="secondary"
						onClick={() => {
							previewUser(pfpRef);
						}}
						sx={{ p: 0 }}>
						<Avatar
							alt="User"
							src={otherUser?.avatarUrl}
							sx={{
								height: "40px",
								width: "40px",
							}}
						/>
					</IconButton>
					<Typography variant="h6" ref={pfpRef}>
						{otherUser?.displayName || "DM"}
					</Typography>
				</Box>
				<Divider />
				<Box sx={{ flexGrow: 1, position: "relative", width: "100%" }}>
					<ChatArea
						messages={messages}
						previewUser={previewUser}
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
