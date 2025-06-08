// src/pages/FriendsPage.jsx
import React from "react";
import { useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import { Box, Stack, Popover, Typography } from "@mui/material";
import ProfileCard from "../../components/User/ProfileCard";
import useFriendPage from "./useFriendPage";
import FriendListItem from "./FriendListItem";

export default function FriendsPage() {
	const navigate = useNavigate();
	const auth = useSelector((state) => state.auth);
	const { friendItems, loading, paperRefs, userPreviewEl, setUserPreviewEl, userPreviewUser, setUserPreviewUser, handleProfilePreview, callApi } =
		useFriendPage();

	const handleChat = () => navigate("/chat");

	if (!auth.loggedIn) return <Typography>Please login.</Typography>;
	if (loading) return <Typography>Loading friends...</Typography>;
	if (!friendItems.length) return <Typography>No friends or pending requests.</Typography>;

	return (
		<Box
			sx={{
				display: "flex",
				flexDirection: { xs: "column", sm: "row" },
				justifyContent: "flex-start",
				overflow: "auto",
				flexGrow: 1,
			}}>
			<Popover
				anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
				transformOrigin={{ vertical: "top", horizontal: "center" }}
				anchorEl={userPreviewEl}
				open={Boolean(userPreviewEl)}
				onClose={() => {
					setUserPreviewEl(null);
					setUserPreviewUser(null);
				}}
				sx={{ mb: 2 }}>
				<ProfileCard self={auth.userId === userPreviewUser?.id} user={userPreviewUser} width="300px" passStyle={{ maxWidth: "300px" }} />
			</Popover>

			<Stack spacing={2} sx={{ width: "100%", maxWidth: { xs: "100%", sm: 500 }, p: 0 }}>
				{friendItems.map(({ relation, profile, status }) => {
					if (!paperRefs.current[relation._id]) paperRefs.current[relation._id] = null;
					return (
						<FriendListItem
							key={relation._id}
							ref={(el) => (paperRefs.current[relation._id] = el)}
							relation={relation}
							profile={profile}
							status={status}
							onPreview={handleProfilePreview}
							onChat={handleChat}
							onAction={callApi}
						/>
					);
				})}
			</Stack>
		</Box>
	);
}
