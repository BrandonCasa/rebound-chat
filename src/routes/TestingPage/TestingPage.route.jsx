import { useTheme } from "@mui/material/styles";
import { Box, Button, Card, CardContent, Grid, Stack, Typography } from "@mui/material";
import { useDispatch } from "react-redux";
import { addSnackbar } from "slices/snackbarSlice";

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
	const dispatch = useDispatch();

	const warnSnackbar = () => {
		dispatch(addSnackbar({ snackbarMsg: "This is a test snackbar.", snackbarSeverity: "warning", autoHideDuration: 2000 }));
	};

	return (
		<Box sx={{ justifyContent: "center", flexGrow: 1, overflow: "hidden" }}>
			<Grid container spacing={2} sx={{ justifyContent: "center" }}>
				<Grid item xs={12} sm={4} md={4} justifyContent="center" sx={{ display: "flex" }}>
					<Card sx={{ p: 2, flexGrow: 1 }}>
						<Typography variant="h5" sx={{ color: `${theme.palette.text.primary}` }}>
							Test Alert
						</Typography>
						<Typography variant="body2" sx={{ color: `${theme.palette.text.secondary}` }}>
							Spawn a 2 second warning snackbar
						</Typography>
						<Button variant="contained" sx={{ mt: 1 }} color="warning" onClick={warnSnackbar}>
							Alert
						</Button>
					</Card>
				</Grid>
			</Grid>
		</Box>
	);
}

export default TestingPage;
