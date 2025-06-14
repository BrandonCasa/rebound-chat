import { Box, Grid, Paper, Stack, useTheme, Card, CardContent, Typography, CardActionArea, CardMedia } from "@mui/material";
import { styled } from "@mui/material/styles";
import { TransitionGrid } from "../LandingPage/utils/TransitionGrid";
import { ItemBox } from "../LandingPage/utils/ItemBox";
import { scrollbarStyles } from "../LandingPage/utils/scrollbarStyles";

const sampleServers = [
	{
		_id: "s1",
		name: "Rebound HQ",
		tags: ["gaming", "community"],
		groups: [
			{
				_id: "g1",
				name: "General",
				rooms: [
					{ _id: "r1", name: "welcome", description: "Say hello" },
					{ _id: "r2", name: "off-topic", description: "Random chat" },
				],
			},
			{
				_id: "g2",
				name: "Games",
				rooms: [
					{ _id: "r3", name: "valorant" },
					{ _id: "r4", name: "overwatch" },
				],
			},
		],
	},
	{
		_id: "s2",
		name: "Dev Corner",
		tags: ["code", "support"],
		groups: [
			{
				_id: "g3",
				name: "General",
				rooms: [
					{ _id: "r5", name: "introductions" },
					{ _id: "r6", name: "help" },
				],
			},
		],
	},
];

function ServerCard({ theme, server }) {
	return (
		<Card sx={{ maxWidth: 345 }}>
			<CardActionArea>
				<CardMedia component="img" height="140" alt="among us" />
				<CardContent>
					<Typography gutterBottom variant="h5" component="div">
						WIP
					</Typography>
					<Typography variant="body2" sx={{ color: "text.secondary" }}>
						this feature isnt done lol
					</Typography>
				</CardContent>
			</CardActionArea>
		</Card>
	);
}

function ServersPage() {
	const theme = useTheme();

	return (
		<Box
			sx={{
				display: "flex",
				flexGrow: 1,
				flexDirection: "column",
				justifyContent: "center",
				overflow: "hidden",
			}}>
			<ItemBox
				sx={{
					width: "100%",
					flexGrow: 1,
					position: "relative",
					overflowX: "hidden",
					overflowY: "auto",
					...scrollbarStyles,
				}}>
				<Box>
					<Grid container spacing={2} sx={{ justifyContent: "center" }}>
						<Grid size={{ xs: 12, sm: 6, md: 4 }} alignItems="stretch" display="flex" justifyContent="center">
							<ServerCard theme={theme} />
						</Grid>
						<Grid size={{ xs: 12, sm: 6, md: 4 }} alignItems="stretch" display="flex" justifyContent="center">
							<ServerCard theme={theme} />
						</Grid>
						<Grid size={{ xs: 12, sm: 6, md: 4 }} alignItems="stretch" display="flex" justifyContent="center">
							<ServerCard theme={theme} />
						</Grid>
						<Grid size={{ xs: 12, sm: 6, md: 4 }} alignItems="stretch" display="flex" justifyContent="center">
							<ServerCard theme={theme} />
						</Grid>
					</Grid>
				</Box>
			</ItemBox>
		</Box>
	);
}

export default ServersPage;
