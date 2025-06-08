import React from "react";
import CameraAlt from "@mui/icons-material/CameraAlt";
import PersonAdd from "@mui/icons-material/PersonAdd";
import PersonOff from "@mui/icons-material/PersonOff";
import PersonRemove from "@mui/icons-material/PersonRemove";
import { Avatar, Box, Button, ButtonGroup, IconButton, Paper, Stack, TextField, Typography } from "@mui/material";
import useProfileCard from "./useProfileCard";

/* -------------------------------------------------- */

const CameraInput = ({ onChange, sx }) => (
	<IconButton component="label" sx={sx} size="small">
		<input hidden type="file" accept="image/*" onChange={onChange} />
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
					onClick={() => onAction("cancelfriend", { friendId }, `Canceled request to ${profile.displayName}`, "info")}>
					Cancel
				</Button>
			);
		case "received":
			return (
				<ButtonGroup fullWidth size="small" variant="contained">
					<Button
						color="success"
						startIcon={<PersonAdd />}
						onClick={() => onAction("acceptfriend", { friendId }, `Accepted request from ${profile.displayName}`)}>
						Accept
					</Button>
					<Button
						color="error"
						startIcon={<PersonRemove />}
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
					onClick={() => onAction("removefriend", { friendId }, `Removed ${profile.displayName} from friends`)}>
					Remove
				</Button>
			);
		default:
			return (
				<Button fullWidth size="small" variant="contained" disabled>
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

	/* ---------- placeholder when no user ---------- */
	if (!user && !forceSelf) {
		return <></>;
	}

	if (type === "mini") return <Paper>mini</Paper>;
	if (type === "popout") return <Paper>popout</Paper>;

	/* ---------- main render ---------- */
	return (
		<Paper
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
						src={banner.preview || (window.isElectron ? "banner.webp" : "/banner.webp")}
						alt="banner"
						sx={{
							width: "100%",
							height: 120,
							borderRadius: 1,
							objectFit: "cover",
						}}
						key={banner.preview}
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
						<Avatar src={avatar.preview || (window.isElectron ? "defaultpfp.webp" : "/defaultpfp.webp")} sx={{ width: 56, height: 56 }} />
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
							<TextField fullWidth size="small" label="Display Name" value={name} onChange={(e) => setName(e.target.value)} />
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
						<TextField fullWidth multiline rows={4} label="Bio" value={bio} onChange={(e) => setBio(e.target.value)} />
					) : (
						<Typography variant="body2" color="text.secondary">
							{profile.bio || "This user hasn’t written a bio yet."}
						</Typography>
					)}
				</Paper>

				{/* Actions */}
				<Box sx={{ pt: 1 }}>
					{isSelf ? (
						editMode ? (
							<Stack direction="row" spacing={1}>
								<Button fullWidth variant="contained" size="small" onClick={saveProfile}>
									Save
								</Button>
								<Button fullWidth variant="outlined" size="small" onClick={() => setEdit(false)}>
									Cancel
								</Button>
							</Stack>
						) : (
							<Button fullWidth variant="contained" size="small" onClick={() => setEdit(true)}>
								Edit Profile
							</Button>
						)
					) : (
						<FriendButtons status={status} friendId={friendId} profile={profile} onAction={callApi} />
					)}
				</Box>
			</Stack>
		</Paper>
	);
}
