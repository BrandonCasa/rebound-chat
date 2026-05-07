import React from "react";
import CameraAlt from "@mui/icons-material/CameraAlt";
import PersonAdd from "@mui/icons-material/PersonAdd";
import PersonOff from "@mui/icons-material/PersonOff";
import PersonRemove from "@mui/icons-material/PersonRemove";
import { Avatar, Box, Button, ButtonGroup, Chip, Divider, Fab, IconButton, Paper, Stack, TextField, Typography } from "@mui/material";
import useProfileCard from "./useProfileCard";
import { useNavigate, useLocation } from "react-router-dom";
import { profileMediaUrl } from "../../helpers/mediaUrl";

/* -------------------------------------------------- */

const CameraInput = ({ onChange, sx }) => (
	<IconButton component="label" sx={sx} size="small" data-testid="profile-card-camera-input">
		<input hidden type="file" accept="image/*" onChange={onChange} data-testid="profile-card-camera-file-input" />
		<CameraAlt fontSize="small" />
	</IconButton>
);

function FriendButtons({ status, friendId, profile, onAction }) {
	switch (status) {
		case "none":
			return (
				<Button
					fullWidth
					size="small"
					variant="contained"
					color="secondary"
					startIcon={<PersonAdd />}
					data-testid="profile-card-add-friend-button"
					onClick={() => onAction("addfriend", { recipientId: profile.id }, `Sent request to ${profile.displayName}`)}>
					Add
				</Button>
			);
		case "sent":
			return (
				<Button
					fullWidth
					size="small"
					variant="outlined"
					color="info"
					startIcon={<PersonOff />}
					data-testid="profile-card-cancel-friend-button"
					onClick={() => onAction("cancelfriend", { friendId }, `Canceled request to ${profile.displayName}`, "info")}>
					Cancel
				</Button>
			);
		case "received":
			return (
				<ButtonGroup fullWidth size="small" variant="contained" data-testid="profile-card-friend-request-actions">
					<Button
						color="success"
						startIcon={<PersonAdd />}
						data-testid="profile-card-accept-friend-button"
						onClick={() => onAction("acceptfriend", { friendId }, `Accepted request from ${profile.displayName}`)}>
						Accept
					</Button>
					<Button
						color="error"
						startIcon={<PersonRemove />}
						data-testid="profile-card-decline-friend-button"
						onClick={() => onAction("declinefriend", { friendId }, `Declined request from ${profile.displayName}`, "warning")}>
						Decline
					</Button>
				</ButtonGroup>
			);
		case "friends":
			return (
				<Button
					fullWidth
					size="small"
					variant="contained"
					color="error"
					startIcon={<PersonRemove />}
					data-testid="profile-card-remove-friend-button"
					onClick={() => onAction("removefriend", { friendId }, `Removed ${profile.displayName} from friends`)}>
					Remove
				</Button>
			);
		default:
			return (
				<Button fullWidth size="small" variant="contained" disabled data-testid="profile-card-friend-action-unavailable">
					---
				</Button>
			);
	}
}

export default function ProfileCard({ user, self: forceSelf = false, type = "full", width = "auto", passStyle }) {
	const { isSelf, profile, editMode, setEdit, name, setName, bio, setBio, banner, avatar, status, friendId, callApi, saveProfile } = useProfileCard(
		user,
		forceSelf
	);

	const confirmedFriends = Array.isArray(profile.friends) ? profile.friends.filter((f) => f.confirmed).length : 0;
	const pendingFriends = Array.isArray(profile.friends) ? profile.friends.filter((f) => !f.confirmed).length : 0;
	const mutualFriends = Array.isArray(profile.mutualFriends) ? profile.mutualFriends.length : 0;
	const mutualServers = Array.isArray(profile.servers) ? profile.servers.length : 0;
	const serverInvites = Array.isArray(profile.serverInvites) ? profile.serverInvites.length : 0;

	const navigate = useNavigate();
	const location = useLocation();

	/* ---------- placeholder when no user ---------- */
	if (!user && !forceSelf) {
		return <></>;
	}

	if (type === "mini") return <Paper data-testid="profile-card-mini">mini</Paper>;
	if (type === "preview") {
		return (
			<Paper
				data-testid="profile-card-preview"
				data-profile-id={profile.id || ""}
				sx={{
					width,
					maxHeight: passStyle?.maxHeight,
					display: "flex",
					flexDirection: "column",
					overflow: "hidden",
					textAlign: "start",
					border: "3px solid rgba(0, 0, 0, 0.3)",
					...passStyle,
				}}
				variant={"outlined"}>
				<Stack spacing={1} sx={{ p: 1, flex: 1 }}>
					{/* Banner */}
					<Box position="relative">
						<Box
							component="img"
							src={profileMediaUrl(banner.preview, "banner.webp")}
							alt="banner"
							sx={{
								width: "100%",
								height: 120,
								borderRadius: 1,
								objectFit: "cover",
							}}
							key={profileMediaUrl(banner.preview, "banner.webp")}
						/>
					</Box>

					{/* Avatar + Name */}
					<Stack direction="row" spacing={2} alignItems="center">
						<Box position="relative">
							<Avatar src={profileMediaUrl(avatar.preview, "defaultpfp.webp")} sx={{ width: 56, height: 56 }} />
						</Box>
						<Box flex={1} minWidth={0}>
							<Typography variant="h6" noWrap>
								{profile.displayName || "Display Name"}
							</Typography>
							<Typography variant="body2" color="text.secondary">
								@{profile.username || "username"}
							</Typography>
						</Box>
					</Stack>

					{/* Bio */}
					<Paper variant="outlined" sx={{ p: 1, flex: 1, minHeight: 80 }}>
						<Typography variant="subtitle2">About Me</Typography>
						<Typography variant="body2" color="text.secondary">
							{profile.bio || "This user hasn’t written a bio yet."}
						</Typography>
					</Paper>
					{profile.createdAt && (
						<Typography variant="caption" color="text.secondary">
							Joined {new Date(profile.createdAt).toLocaleDateString()}
						</Typography>
					)}
				</Stack>
			</Paper>
		);
	}

	/* ---------- main render ---------- */
	return (
		<Paper
			data-testid="profile-card"
			data-profile-id={profile.id || ""}
			data-profile-self={isSelf ? "true" : "false"}
			sx={{
				width,
				maxHeight: passStyle?.maxHeight,
				display: "flex",
				flexDirection: "column",
				overflow: "hidden",
				...passStyle,
			}}
			elevation={3}>
			<Stack spacing={1} sx={{ p: 1, flex: 1 }}>
				{/* Banner */}
				<Box position="relative">
					<Box
						component="img"
						src={profileMediaUrl(banner.preview, "banner.webp")}
						alt="banner"
						data-testid="profile-card-banner"
						sx={{
							width: "100%",
							height: 120,
							borderRadius: 1,
							objectFit: "cover",
						}}
						key={profileMediaUrl(banner.preview, "banner.webp")}
					/>
					{isSelf && editMode && (
						<CameraInput
							onChange={banner.onChange}
							sx={{
								position: "absolute",
								top: 8,
								right: 8,
								bgcolor: "rgba(255,255,255,0.7)",
							}}
						/>
					)}
				</Box>

				{/* Avatar + Name */}
				<Stack direction="row" spacing={2} alignItems="center">
					<Box position="relative">
						<Avatar src={profileMediaUrl(avatar.preview, "defaultpfp.webp")} sx={{ width: 56, height: 56 }} data-testid="profile-card-avatar" />
						{isSelf && editMode && (
							<CameraInput
								onChange={avatar.onChange}
								sx={{
									position: "absolute",
									bottom: -4,
									right: -4,
									bgcolor: "white",
								}}
							/>
						)}
					</Box>
					<Box flex={1} minWidth={0}>
						{editMode ? (
							<TextField
								fullWidth
								size="small"
								label="Display Name"
								value={name}
								onChange={(e) => setName(e.target.value)}
								inputProps={{ "data-testid": "profile-card-display-name-input" }}
							/>
						) : (
							<Typography variant="h6" noWrap>
								{profile.displayName}
							</Typography>
						)}
						<Typography variant="body2" color="text.secondary">
							@{profile.username}
						</Typography>
					</Box>
				</Stack>

				{/* Bio */}
				<Paper variant="outlined" sx={{ p: 1, flex: 1, minHeight: 80 }}>
					<Typography variant="subtitle2">About Me</Typography>
					{editMode ? (
						<TextField
							fullWidth
							multiline
							rows={4}
							label="Bio"
							value={bio}
							onChange={(e) => setBio(e.target.value)}
							inputProps={{ "data-testid": "profile-card-bio-input" }}
						/>
					) : (
						<Typography variant="body2" color="text.secondary">
							{profile.bio || "This user hasn’t written a bio yet."}
						</Typography>
					)}
				</Paper>
				<Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
					{isSelf ? (
						<>
							<Chip label={`Friends: ${confirmedFriends}`} size="small" />
							<Chip label={`Pending: ${pendingFriends}`} size="small" /> {/** <Chip label={`Invites: ${serverInvites}`} size="small" /> **/}
						</>
					) : (
						<>
							<Chip label={`Mutual friends: ${mutualFriends}`} size="small" /> {/** <Chip label={`Shared servers: ${mutualServers}`} size="small" /> **/}
						</>
					)}
				</Stack>
				{profile.createdAt && !editMode && (
					<Typography variant="caption" color="text.secondary">
						Joined {new Date(profile.createdAt).toLocaleDateString()}
					</Typography>
				)}

				{/* Actions */}
				<Box>
					{isSelf ? (
						editMode ? (
							<Stack direction="row" spacing={1}>
								<Button fullWidth variant="contained" size="small" onClick={saveProfile} data-testid="profile-card-save-button">
									Save
								</Button>
								<Button fullWidth variant="outlined" size="small" onClick={() => setEdit(false)} data-testid="profile-card-cancel-edit-button">
									Cancel
								</Button>
							</Stack>
						) : (
							<Button fullWidth variant="contained" size="small" onClick={() => setEdit(true)} data-testid="profile-card-edit-button">
								Edit Profile
							</Button>
						)
					) : (
						<Stack direction="row" spacing={1} sx={{ width: "100%" }}>
							<FriendButtons status={status} friendId={friendId} profile={profile} onAction={callApi} />
							{location.pathname !== `/dm/${profile.id}` && (
								<Button variant="outlined" size="small" color="info" onClick={() => navigate(`/dm/${profile.id}`)} data-testid="profile-card-chat-button">
									Chat
								</Button>
							)}
						</Stack>
					)}
				</Box>
			</Stack>
		</Paper>
	);
}
