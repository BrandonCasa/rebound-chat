import { useTheme } from "@mui/material/styles";
import { Box, Card, CardContent, Grid, Stack, Typography } from "@mui/material";

function TestingCard({ title, description }) {
	let theme = useTheme();

	return (
		<Card sx={{ p: 0, flexGrow: 1 }}>
			<CardContent>
				<Typography variant="h5" sx={{ color: `${theme.palette.text.primary}` }}>
					{title}
				</Typography>
				<Typography variant="body2" sx={{ color: `${theme.palette.text.secondary}` }}>
					{description}
				</Typography>
			</CardContent>
		</Card>
	);
}

function TestingPage(props) {
	const theme = useTheme();

	return (
		<Box sx={{ justifyContent: "center", flexGrow: 1, overflow: "hidden" }}>
			<Grid container spacing={2} sx={{ justifyContent: "center" }}>
				<Grid item xs={12} sm={4} md={4} justifyContent="center" sx={{ display: "flex" }}>
					<Card sx={{ p: 0, flexGrow: 1 }}>
						<CardContent>
							<Typography variant="h5" sx={{ color: `${theme.palette.text.primary}` }}>
								Test Alert
							</Typography>
							<Typography variant="body2" sx={{ color: `${theme.palette.text.secondary}` }}>
								Spawn a 2 second error snackbar
							</Typography>
						</CardContent>
					</Card>
				</Grid>
			</Grid>
		</Box>
	);
}

export default TestingPage;
