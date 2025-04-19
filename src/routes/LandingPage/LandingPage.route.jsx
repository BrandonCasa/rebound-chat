import { Box, Chip, Divider, Stack } from "@mui/material";
import Grid from "@mui/material/Grid";
import React from "react";

import FeatureCard from "components/FeatureCard";
import LandingHeader from "components/LandingHeader";
import { ItemBox } from "routes/LandingPage/utils/ItemBox";
import { scrollbarStyles } from "routes/LandingPage/utils/scrollbarStyles";
import { TransitionGrid } from "routes/LandingPage/utils/TransitionGrid";

function LandingPage(_props) {
	return (
		<Box
			sx={{
				display: "flex",
				justifyContent: "center",
				flexGrow: 1,
				overflow: "hidden",
			}}
		>
			<Stack spacing={2} sx={{ height: "100%", width: "100%" }}>
				<LandingHeader title="Introducing Rebound" subtitle="The social hub for gamers and friends." />
				<ItemBox
					sx={{
						width: "100%",
						flexGrow: 1,
						position: "relative",
						overflowX: "hidden",
						overflowY: "auto",
						...scrollbarStyles,
					}}
				>
					<Box>
						<Grid container spacing={2} sx={{ justifyContent: "center" }}>
							<TransitionGrid size={{ xs: 12, sm: 6, md: 4 }} alignItems="stretch" maxHeight={200} display="flex" justifyContent="center">
								<FeatureCard title="Friend Footprints" description="Allows you to optionally share your activity trends with friends of your choosing." />
							</TransitionGrid>
							<TransitionGrid size={{ xs: 12, sm: 6, md: 4 }} alignItems="stretch" maxHeight={200} display="flex" justifyContent="center">
								<FeatureCard title="Theme Designer" description="Create the theme of your dreams with custom colors and more." />
							</TransitionGrid>
							<TransitionGrid size={{ xs: 12, sm: 6, md: 4 }} alignItems="stretch" maxHeight={200} display="flex" justifyContent="center">
								<FeatureCard title="The Hub" description="A place to view the activity of your friends and start new conversations." />
							</TransitionGrid>
							<TransitionGrid size={{ xs: 12, sm: 6, md: 4 }} alignItems="stretch" maxHeight={200} display="flex" justifyContent="center">
								<FeatureCard title="Noise Suppression" description="Turn noise suppression on/off for someones mic on your end." />
							</TransitionGrid>
							<TransitionGrid size={{ xs: 12, sm: 6, md: 4 }} alignItems="stretch" maxHeight={200} display="flex" justifyContent="center">
								<FeatureCard title="Unique Profile" description="Profile pages where you can showcase yourself in your style." />
							</TransitionGrid>
							<TransitionGrid size={{ xs: 12, sm: 6, md: 4 }} alignItems="stretch" maxHeight={200} display="flex" justifyContent="center">
								<FeatureCard title="Branching Profiles" description="Instead of making a new account, create a profile variant that can share specific servers and chats." />
							</TransitionGrid>
							<TransitionGrid size={{ xs: 12, sm: 6, md: 4 }} alignItems="stretch" maxHeight={200} display="flex" justifyContent="center">
								<FeatureCard title="Watch Together" description="High quality screen sharing and video chat." />
							</TransitionGrid>
							<TransitionGrid size={{ xs: 12, sm: 6, md: 4 }} alignItems="stretch" maxHeight={200} display="flex" justifyContent="center">
								<FeatureCard title="Friend Events" description="Schedule events with your friends." />
							</TransitionGrid>
							<TransitionGrid size={{ xs: 12, sm: 6, md: 4 }} alignItems="stretch" maxHeight={200} display="flex" justifyContent="center">
								<FeatureCard title="Media Interaction" description="See how many people watch your embeds and when. Like or dislike images and videos." />
							</TransitionGrid>
							<TransitionGrid size={{ xs: 12, sm: 6, md: 4 }} alignItems="stretch" maxHeight={200} display="flex" justifyContent="center">
								<FeatureCard title="Meme Archive" description="Mark images/videos as memes to allow users to save and archive them." />
							</TransitionGrid>
							<TransitionGrid size={{ xs: 12, sm: 6, md: 4 }} alignItems="stretch" maxHeight={200} display="flex" justifyContent="center">
								<FeatureCard title="Meme Deck" description="Easily access and categorize your archived memes for sharing." />
							</TransitionGrid>
							<TransitionGrid size={{ xs: 12, sm: 6, md: 4 }} alignItems="stretch" maxHeight={200} display="flex" justifyContent="center">
								<FeatureCard title="Meme Directory" description="Find memes within the global meme directory you can optionally add to." />
							</TransitionGrid>
							<TransitionGrid size={{ xs: 12, sm: 6, md: 4 }} alignItems="stretch" maxHeight={200} display="flex" justifyContent="center">
								<FeatureCard title="Forms and Polls" description="Create forms and polls with ease. Results can be public or have limited access." />
							</TransitionGrid>
							<TransitionGrid size={{ xs: 12, sm: 6, md: 4 }} alignItems="stretch" maxHeight={200} display="flex" justifyContent="center">
								<FeatureCard title="Share History" description="View the file sharing tree to see who originally uploaded a file and others who sent it again." />
							</TransitionGrid>
							<TransitionGrid size={{ xs: 12, sm: 6, md: 4 }} alignItems="stretch" maxHeight={200} display="flex" justifyContent="center">
								<FeatureCard title="Embed Tags" description="Videos, Images and files are automatically recommended tags you can modify upon upload." />
							</TransitionGrid>
							<TransitionGrid size={{ xs: 12, sm: 6, md: 4 }} alignItems="stretch" maxHeight={200} display="flex" justifyContent="center">
								<FeatureCard title="Friend Cards" description="Add information only you can see to your friends' profiles as you learn more about them." />
							</TransitionGrid>
							<TransitionGrid size={{ xs: 12, sm: 6, md: 4 }} alignItems="stretch" maxHeight={200} display="flex" justifyContent="center">
								<FeatureCard title="Friend Birthdays" description="Choose who knows your birth day, month or year and share the celebration." />
							</TransitionGrid>
							<TransitionGrid size={{ xs: 12, sm: 6, md: 4 }} alignItems="stretch" maxHeight={200} display="flex" justifyContent="center">
								<FeatureCard title="Friend Sharing" description="Send friend cards to other people with permission of the person being shared." />
							</TransitionGrid>
							<TransitionGrid size={{ xs: 12, sm: 6, md: 4 }} alignItems="stretch" maxHeight={200} display="flex" justifyContent="center">
								<FeatureCard title="Chat Sharing" description="Share snippets of chats to other people with permission of everyone involved." />
							</TransitionGrid>
						</Grid>
					</Box>
				</ItemBox>
			</Stack>
		</Box>
	);
}

export default LandingPage;
