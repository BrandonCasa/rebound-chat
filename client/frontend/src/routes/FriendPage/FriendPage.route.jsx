// src/pages/FriendsPage.jsx
import React from "react";
import { useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import { Avatar, Box, Chip, Divider, Paper, Popover, Stack, Typography, alpha } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import PeopleAltRoundedIcon from "@mui/icons-material/PeopleAltRounded";
import HourglassTopRoundedIcon from "@mui/icons-material/HourglassTopRounded";
import MarkEmailUnreadRoundedIcon from "@mui/icons-material/MarkEmailUnreadRounded";

import ProfileCard from "../../components/User/ProfileCard";
import useFriendPage from "./useFriendPage";
import FriendListItem from "./FriendListItem";

const SECTION_CONFIG = {
	received: {
		title: "Incoming Requests",
		icon: <MarkEmailUnreadRoundedIcon fontSize="small" />,
		color: "warning",
		empty: "No incoming friend requests.",
	},
	friends: {
		title: "Friends",
		icon: <PeopleAltRoundedIcon fontSize="small" />,
		color: "success",
		empty: "No friends yet.",
	},
	sent: {
		title: "Sent Requests",
		icon: <HourglassTopRoundedIcon fontSize="small" />,
		color: "info",
		empty: "No outgoing requests.",
	},
};

function EmptyState({ children }) {
	return (
		<Paper
			elevation={0}
			data-testid="friends-empty-state"
			sx={{
				p: { xs: 2.5, sm: 4 },
				borderRadius: { xs: 3, sm: 4 },
				textAlign: "center",
				border: "1px dashed",
				borderColor: "divider",
				bgcolor: "background.paper",
			}}>
			<Typography color="text.secondary" variant="body2">
				{children}
			</Typography>
		</Paper>
	);
}

function FriendSection({ type, items, paperRefs, onPreview, onChat, onAction }) {
	if (!items.length) return null;

	const config = SECTION_CONFIG[type];

	return (
		<Stack spacing={{ xs: 1, sm: 1.5 }} data-testid="friends-section" data-friend-section={type}>
			<Stack
				direction="row"
				alignItems="center"
				spacing={1}
				sx={{
					minWidth: 0,
				}}>
				<Chip
					icon={config.icon}
					label={config.title}
					color={config.color}
					size="small"
					sx={{
						fontWeight: 800,
						borderRadius: 999,
						maxWidth: { xs: "calc(100vw - 96px)", sm: "none" },

						"& .MuiChip-label": {
							overflow: "hidden",
							textOverflow: "ellipsis",
							whiteSpace: "nowrap",
						},
					}}
				/>

				<Typography
					variant="body2"
					color="text.secondary"
					sx={{
						flexShrink: 0,
						fontWeight: 700,
					}}>
					{items.length}
				</Typography>

				<Divider sx={{ flex: 1, minWidth: 24 }} />
			</Stack>

			<Stack spacing={{ xs: 1, sm: 1.25 }}>
				{items.map(({ relation, profile, status }) => {
					if (!paperRefs.current[relation._id]) paperRefs.current[relation._id] = null;

					return (
						<FriendListItem
							key={relation._id}
							ref={(el) => {
								paperRefs.current[relation._id] = el;
							}}
							relation={relation}
							profile={profile}
							status={status}
							onPreview={onPreview}
							onChat={onChat}
							onAction={onAction}
						/>
					);
				})}
			</Stack>
		</Stack>
	);
}

export default function FriendsPage() {
	const navigate = useNavigate();
	const auth = useSelector((state) => state.auth);
	const theme = useTheme();

	const { friendItems, loading, paperRefs, userPreviewEl, setUserPreviewEl, userPreviewUser, setUserPreviewUser, handleProfilePreview, callApi } =
		useFriendPage();

	const handleChat = (profileId) => navigate(`/dm/${profileId}`);

	const grouped = React.useMemo(
		() => ({
			received: friendItems.filter((item) => item.status === "received"),
			friends: friendItems.filter((item) => item.status === "friends"),
			sent: friendItems.filter((item) => item.status === "sent"),
		}),
		[friendItems]
	);

	const totalPending = grouped.received.length + grouped.sent.length;

	if (!auth.loggedIn) {
		return (
			<Box sx={{ p: { xs: 1.5, sm: 3 } }} data-testid="friends-login-required">
				<EmptyState>Please login.</EmptyState>
			</Box>
		);
	}

	if (loading) {
		return (
			<Box sx={{ p: { xs: 1.5, sm: 3 } }} data-testid="friends-loading-state">
				<EmptyState>Loading friends...</EmptyState>
			</Box>
		);
	}

	return (
		<Box
			data-testid="friends-page"
			sx={{
				flexGrow: 1,
				overflow: "auto",
				display: "flex",
				justifyContent: "center",
				px: { xs: 1, sm: 3 },
				py: { xs: 1.5, sm: 3 },
			}}>
			<Popover
				data-testid="friends-profile-preview-popover"
				anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
				transformOrigin={{ vertical: "top", horizontal: "center" }}
				anchorEl={userPreviewEl}
				open={Boolean(userPreviewEl)}
				marginThreshold={8}
				onClose={() => {
					setUserPreviewEl(null);
					setUserPreviewUser(null);
				}}
				PaperProps={{
					sx: {
						width: { xs: "calc(100vw - 24px)", sm: 300 },
						maxWidth: 300,
						overflow: "hidden",
						boxShadow: 12,
					},
				}}>
				<ProfileCard
					self={auth.userId === userPreviewUser?.id}
					user={userPreviewUser}
					width="100%"
					passStyle={{
						width: "100%",
						maxWidth: "300px",
					}}
				/>
			</Popover>

			<Stack
				spacing={{ xs: 2, sm: 3 }}
				sx={{
					width: "100%",
					maxWidth: 860,
					minWidth: 0,
				}}>
				<Paper
					elevation={0}
					data-testid="friends-summary-card"
					sx={{
						p: { xs: 2, sm: 3 },
						borderRadius: { xs: 3, sm: 5 },
						border: "1px solid",
						borderColor: "divider",
						bgcolor: (theme) => alpha(theme.palette.background.paper, 0.82),
						backdropFilter: "blur(12px)",
					}}>
					<Stack
						direction={{ xs: "column", sm: "row" }}
						justifyContent="space-between"
						alignItems={{ xs: "stretch", sm: "center" }}
						spacing={{ xs: 1.5, sm: 2 }}>
						<Box sx={{ minWidth: 0 }}>
							<Typography
								variant="h4"
								sx={{
									fontWeight: 900,
									letterSpacing: "-0.04em",
									fontSize: { xs: "1.8rem", sm: "2.125rem" },
									lineHeight: 1.1,
								}}>
								Friends
							</Typography>

							<Typography
								color="text.secondary"
								sx={{
									mt: 0.5,
									fontSize: { xs: "0.9rem", sm: "1rem" },
								}}>
								Manage chats, requests, and your friend list.
							</Typography>
						</Box>

						<Stack
							direction="row"
							spacing={1}
							useFlexGap
							flexWrap="wrap"
							sx={{
								justifyContent: { xs: "flex-start", sm: "flex-end" },

								"& .MuiChip-root": {
									maxWidth: "100%",
									fontWeight: 700,
								},

								"& .MuiAvatar-root": {
									width: 24,
									height: 24,
									fontSize: "0.8rem",
								},
							}}>
							<Chip
								data-testid="friends-count-chip"
								avatar={
									<Avatar
										sx={{
											backgroundColor: "#ffffff00",
											backgroundImage: "none",
											border: "1px solid",
											borderColor: "success.main",
											// inward box shadow
											boxShadow: (theme) => `inset 0 0 3px 1px ${alpha(theme.palette.success.dark, 0.55)}`,
										}}>
										{grouped.friends.length}
									</Avatar>
								}
								sx={{
									"& .MuiChip-avatar": {
										color: "text.primary",
									},
								}}
								label="Friends"
								color="success"
								variant="outlined"
							/>

							<Chip
								data-testid="friends-pending-count-chip"
								avatar={
									<Avatar
										sx={{
											backgroundColor: "#ffffff00",
											backgroundImage: "none",
											border: "1px solid",
											borderColor: "info.main",
											// inward box shadow
											boxShadow: (theme) => `inset 0 0 3px 1px ${alpha(theme.palette.info.dark, 0.55)}`,
										}}>
										{totalPending}
									</Avatar>
								}
								sx={{
									"& .MuiChip-avatar": {
										color: "text.primary",
									},
								}}
								label="Pending"
								color="info"
								variant="outlined"
							/>
						</Stack>
					</Stack>
				</Paper>

				{!friendItems.length ? (
					<EmptyState>No friends or pending requests.</EmptyState>
				) : (
					<Stack spacing={{ xs: 2.25, sm: 3 }}>
						<FriendSection
							type="received"
							items={grouped.received}
							paperRefs={paperRefs}
							onPreview={handleProfilePreview}
							onChat={handleChat}
							onAction={callApi}
						/>

						<FriendSection
							type="friends"
							items={grouped.friends}
							paperRefs={paperRefs}
							onPreview={handleProfilePreview}
							onChat={handleChat}
							onAction={callApi}
						/>

						<FriendSection type="sent" items={grouped.sent} paperRefs={paperRefs} onPreview={handleProfilePreview} onChat={handleChat} onAction={callApi} />
					</Stack>
				)}
			</Stack>
		</Box>
	);
}
