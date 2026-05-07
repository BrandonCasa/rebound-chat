// src/pages/FriendsPage/FriendListItem.jsx
import React from "react";
import { Avatar, Box, Button, Chip, IconButton, Paper, Stack, Tooltip, Typography, alpha } from "@mui/material";

import PersonRemoveRoundedIcon from "@mui/icons-material/PersonRemoveRounded";
import ChatRoundedIcon from "@mui/icons-material/ChatRounded";
import CancelRoundedIcon from "@mui/icons-material/CancelRounded";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import HighlightOffRoundedIcon from "@mui/icons-material/HighlightOffRounded";
import PersonRoundedIcon from "@mui/icons-material/PersonRounded";

const defaultAvatar = window.isElectron ? "defaultpfp.webp" : "/defaultpfp.webp";

const STATUS_META = {
	friends: {
		label: "Friend",
		color: "success",
		accent: "success.main",
		bg: "success.main",
	},
	sent: {
		label: "Sent",
		color: "info",
		accent: "info.main",
		bg: "info.main",
	},
	received: {
		label: "Request",
		color: "warning",
		accent: "warning.main",
		bg: "warning.main",
	},
};

const FriendListItem = React.forwardRef(({ relation, profile, status, onPreview, onChat, onAction }, ref) => {
	const meta = STATUS_META[status] || STATUS_META.friends;

	const stop = (handler) => (event) => {
		event.stopPropagation();
		handler?.(event);
	};

	return (
		<Paper
			ref={ref}
			elevation={0}
			data-testid="friend-list-item"
			data-friend-relation-id={relation._id || ""}
			data-friend-profile-id={profile.id || ""}
			data-friend-status={status || ""}
			onClick={() => onPreview(profile.id, relation._id)}
			sx={{
				position: "relative",
				overflow: "hidden",
				p: { xs: 1.5, sm: 2 },
				borderRadius: 2,
				cursor: "pointer",
				border: "1px solid",
				borderColor: "divider",
				bgcolor: (theme) => alpha(theme.palette.background.paper, 0.9),
				backdropFilter: "blur(10px)",
				transition: "transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease, background-color 160ms ease",
				"&:before": {
					content: '""',
					position: "absolute",
					inset: 0,
					width: 5,
					bgcolor: meta.accent,
				},
				"&:hover": {
					transform: "translateY(-2px)",
					boxShadow: (theme) => `0 18px 45px ${alpha(theme.palette.common.black, 0.18)}`,
					borderColor: meta.accent,
				},
			}}>
			<Stack direction={{ xs: "column", sm: "row" }} alignItems={{ xs: "stretch", sm: "center" }} justifyContent="space-between" spacing={2} sx={{ pl: 1 }}>
				<Stack direction="row" alignItems="center" spacing={1.75} minWidth={0}>
					<Box sx={{ position: "relative", flexShrink: 0 }}>
						<Avatar
							src={profile.avatarUrl || defaultAvatar}
							data-testid="friend-list-item-avatar"
							sx={{
								width: { xs: 52, sm: 64 },
								height: { xs: 52, sm: 64 },
								border: "3px solid",
								borderColor: "background.paper",
								boxShadow: (theme) => `0 0 0 2px ${alpha(theme.palette[meta.color].main, 0.55)}`,
							}}>
							<PersonRoundedIcon />
						</Avatar>

						<Box
							sx={{
								position: "absolute",
								right: -2,
								bottom: -2,
								width: 15,
								height: 15,
								borderRadius: "50%",
								bgcolor: meta.accent,
								border: "2px solid",
								borderColor: "background.paper",
							}}
						/>
					</Box>

					<Box minWidth={0}>
						<Stack direction="row" alignItems="center" spacing={1} sx={{ minWidth: 0 }}>
							<Typography
								variant="h6"
								noWrap
								data-testid="friend-list-item-name"
								sx={{
									fontWeight: 900,
									letterSpacing: "-0.02em",
									lineHeight: 1.15,
								}}>
								{profile.displayName}
							</Typography>

							<Chip
								data-testid="friend-list-item-status-chip"
								label={meta.label}
								color={meta.color}
								size="small"
								sx={{
									height: 22,
									fontSize: 11,
									fontWeight: 800,
									borderRadius: 999,
								}}
							/>
						</Stack>

						<Typography variant="body2" color="text.secondary" noWrap sx={{ mt: 0.4 }}>
							@{profile.username}
						</Typography>
					</Box>
				</Stack>

				<Stack direction="row" spacing={1} justifyContent={{ xs: "flex-end", sm: "center" }} alignItems="center" flexWrap="wrap" useFlexGap>
					{status === "friends" && (
						<>
							<Tooltip title="Start Chat">
								<Button
									startIcon={<ChatRoundedIcon />}
									variant="contained"
									color="info"
									size="small"
									data-testid="friend-list-item-chat-button"
									onClick={stop(() => onChat(profile.id))}
									sx={{
										borderRadius: 999,
										px: 1.75,
										fontWeight: 800,
										boxShadow: "none",
									}}>
									Chat
								</Button>
							</Tooltip>

							<Tooltip title="Remove Friend">
								<IconButton
									color="error"
									data-testid="friend-list-item-remove-button"
									onClick={stop(() => onAction("removefriend", { friendId: relation._id }, relation._id))}
									sx={{
										border: "1px solid",
										borderColor: "divider",
										bgcolor: "background.paper",
										"&:hover": {
											bgcolor: (theme) => alpha(theme.palette.error.main, 0.1),
										},
									}}>
									<PersonRemoveRoundedIcon fontSize="small" />
								</IconButton>
							</Tooltip>
						</>
					)}

					{status === "sent" && (
						<Tooltip title="Cancel Request">
							<Button
								startIcon={<CancelRoundedIcon />}
								variant="outlined"
								color="warning"
								size="small"
								data-testid="friend-list-item-cancel-button"
								onClick={stop(() => onAction("cancelfriend", { friendId: relation._id }, relation._id))}
								sx={{
									borderRadius: 999,
									px: 1.75,
									fontWeight: 800,
								}}>
								Cancel
							</Button>
						</Tooltip>
					)}

					{status === "received" && (
						<>
							<Tooltip title="Accept Request">
								<Button
									startIcon={<CheckCircleRoundedIcon />}
									variant="contained"
									color="success"
									size="small"
									data-testid="friend-list-item-accept-button"
									onClick={stop(() => onAction("acceptfriend", { friendId: relation._id }, relation._id))}
									sx={{
										borderRadius: 999,
										px: 1.75,
										fontWeight: 800,
										boxShadow: "none",
									}}>
									Accept
								</Button>
							</Tooltip>

							<Tooltip title="Decline Request">
								<IconButton
									color="error"
									data-testid="friend-list-item-decline-button"
									onClick={stop(() => onAction("declinefriend", { friendId: relation._id }, relation._id))}
									sx={{
										border: "1px solid",
										borderColor: "divider",
										bgcolor: "background.paper",
										"&:hover": {
											bgcolor: (theme) => alpha(theme.palette.error.main, 0.1),
										},
									}}>
									<HighlightOffRoundedIcon fontSize="small" />
								</IconButton>
							</Tooltip>
						</>
					)}
				</Stack>
			</Stack>
		</Paper>
	);
});

FriendListItem.displayName = "FriendListItem";

export default FriendListItem;
