import { Box, Button, Card, Grid, List, ListItem, ListItemText, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { useDispatch, useSelector } from "react-redux";

import { addSnackbar } from "slices/snackbarSlice";

function TestingPage(_props) {
	const theme = useTheme();
	const dispatch = useDispatch();
	const snackbarList = useSelector((state) => state.snackbars.snackbarList);

	const warnSnackbar = () => {
		dispatch(
			addSnackbar({
				snackbarMsg: "This is a test snackbar.",
				snackbarSeverity: "warning",
				autoHideDuration: 5000,
			})
		);
	};

	return (
		<Box sx={{ justifyContent: "center", flexGrow: 1, overflow: "hidden" }}>
			<Grid container spacing={2} sx={{ justifyContent: "center" }}>
				<Grid size={{ xs: 12, sm: 4, md: 4 }} justifyContent="center" sx={{ display: "flex" }}>
					<Card sx={{ p: 2, flexGrow: 1 }}>
						<Typography variant="h5" sx={{ color: `${theme.palette.text.primary}` }}>
							Test Alert
						</Typography>
						<Typography variant="body2" sx={{ color: `${theme.palette.text.secondary}` }}>
							Spawn a 5 second warn alert
						</Typography>
						<Button variant="contained" sx={{ mt: 1 }} color="warning" onClick={warnSnackbar}>
							Alert
						</Button>
					</Card>
				</Grid>
				<Grid size={{ xs: 12, sm: 4, md: 4 }} justifyContent="center" sx={{ display: "flex" }}>
					<Card sx={{ p: 2, flexGrow: 1 }}>
						<Typography variant="h5" sx={{ color: `${theme.palette.text.primary}` }}>
							Current Snackbars
						</Typography>
						<List sx={{ width: "100%", bgcolor: "background.paper" }}>
							{Object.keys(snackbarList).map((value) => (
								<ListItem key={value}>
									<ListItemText primary={`Snackbar ID: ${value}`} />
								</ListItem>
							))}
						</List>
					</Card>
				</Grid>
			</Grid>
		</Box>
	);
}

export default TestingPage;
