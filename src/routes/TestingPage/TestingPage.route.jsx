import { useTheme } from "@mui/material/styles";
import { Box, Button, Card, CardContent, Grid, List, ListItem, ListItemIcon, ListItemText, Stack, Typography } from "@mui/material";
import { useDispatch, useSelector } from "react-redux";
import { addSnackbar } from "slices/snackbarSlice";

function TestingPage(props) {
	const theme = useTheme();
	const dispatch = useDispatch();
	const snackbarList = useSelector((state) => state.snackbars.snackbarList);

	const warnSnackbar = () => {
		dispatch(addSnackbar({ snackbarMsg: "This is a test snackbar.", snackbarSeverity: "warning", autoHideDuration: 5000 }));
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
							Spawn a 5 second warn alert
						</Typography>
						<Button variant="contained" sx={{ mt: 1 }} color="warning" onClick={warnSnackbar}>
							Alert
						</Button>
					</Card>
				</Grid>
				<Grid item xs={12} sm={4} md={4} justifyContent="center" sx={{ display: "flex" }}>
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
