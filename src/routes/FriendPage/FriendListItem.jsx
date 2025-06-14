import React from "react";
import { Paper, Box, Avatar, Typography, Button, Stack, Tooltip } from "@mui/material";
import PersonRemoveIcon from "@mui/icons-material/PersonRemove";
import ChatRoundedIcon from "@mui/icons-material/ChatRounded";
import CancelIcon from "@mui/icons-material/Cancel";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import HighlightOffIcon from "@mui/icons-material/HighlightOff";

const defaultAvatar = window.isElectron ? "defaultpfp.webp" : "/defaultpfp.webp";

const FriendListItem = React.forwardRef(({ relation, profile, status, onPreview, onChat, onAction }, ref) => (
	<Paper
		ref={ref}
		sx={{
			p: 2,
			display: "flex",
			justifyContent: "space-between",
			flexDirection: { xs: "column", sm: "row" },
			alignItems: "center",
			transition: "box-shadow .3s",
			"&:hover": { boxShadow: 6 },
			border: status === "friends" ? "none" : 2,
			borderColor: status === "sent" ? "info.main" : status === "received" ? "warning.main" : "grey.300",
			gap: 1,
		}}
		elevation={2}
		onClick={() => onPreview(profile.id, relation._id)}>
		<Box sx={{ flexDirection: "row", display: "flex", flexGrow: 1 }}>
			<Avatar
				src={profile.avatarUrl || defaultAvatar}
				sx={{
					width: { xs: 40, sm: 56 },
					height: { xs: 40, sm: 56 },
					mb: 0,
					mr: 2,
				}}
			/>
			<Box flex={1} minWidth={0} sx={{ mr: { sm: 2 } }}>
				<Typography variant="h6" noWrap>
					{profile.displayName}
				</Typography>
				<Typography variant="body2" color="text.secondary" noWrap>
					@{profile.username}
				</Typography>
			</Box>
		</Box>
		<Stack direction="row" spacing={1} flexWrap="wrap">
			{status === "friends" && (
				<>
					<Tooltip title="Start Chat">
						<Button startIcon={<ChatRoundedIcon />} variant="contained" color="info" size="small" onClick={() => onChat(profile.id)}>
							Chat
						</Button>
					</Tooltip>
					<Tooltip title="Remove Friend">
						<Button
							startIcon={<PersonRemoveIcon />}
							variant="outlined"
							color="error"
							size="small"
							onClick={() => onAction("removefriend", { friendId: relation._id }, relation._id)}>
							Remove
						</Button>
					</Tooltip>
				</>
			)}
			{status === "sent" && (
				<Tooltip title="Cancel Request">
					<Button
						startIcon={<CancelIcon />}
						variant="outlined"
						color="warning"
						size="small"
						onClick={() => onAction("cancelfriend", { friendId: relation._id }, relation._id)}>
						Cancel
					</Button>
				</Tooltip>
			)}
			{status === "received" && (
				<>
					<Tooltip title="Accept Request">
						<Button
							startIcon={<CheckCircleIcon />}
							variant="contained"
							color="success"
							size="small"
							onClick={() => onAction("acceptfriend", { friendId: relation._id }, relation._id)}>
							Accept
						</Button>
					</Tooltip>
					<Tooltip title="Decline Request">
						<Button
							startIcon={<HighlightOffIcon />}
							variant="outlined"
							color="error"
							size="small"
							onClick={() => onAction("declinefriend", { friendId: relation._id }, relation._id)}>
							Decline
						</Button>
					</Tooltip>
				</>
			)}
		</Stack>
	</Paper>
));

export default FriendListItem;
