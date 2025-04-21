import React from "react";
import { Box, Button, Card, Grid, List, ListItem, ListItemText, Typography } from "@mui/material";
import { useDispatch, useSelector } from "react-redux";
import { addSnackbar } from "slices/snackbarSlice";

function TestingPage(_props) {
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

	const simulateUpdate = () => {
		const api = window.electronAPI;
		if (api?.simulateUpdate) {
			console.log("→ sending simulate-update");
			api.simulateUpdate();
		} else {
			console.warn("simulateUpdate not available – make sure you’re in Electron");
		}
	};

	return (
		<Box sx={{ justifyContent: "center", flexGrow: 1, overflow: "hidden" }}>
			<Grid container spacing={2} justifyContent="center">
				<Grid size={{ xs: 12, sm: 4, md: 4 }} sx={{ display: "flex", justifyContent: "center" }}>
					<Card sx={{ p: 2, flexGrow: 1 }}>
						<Typography variant="h5" color="text.primary">
							Test Alert
						</Typography>
						<Typography variant="body2" color="text.secondary">
							Spawn a 5 second warn alert
						</Typography>
						<Button variant="contained" color="warning" sx={{ mt: 1 }} onClick={warnSnackbar}>
							Alert
						</Button>
					</Card>
				</Grid>

				<Grid size={{ xs: 12, sm: 4, md: 4 }} sx={{ display: "flex", justifyContent: "center" }}>
					<Card sx={{ p: 2, flexGrow: 1 }}>
						<Typography variant="h5" color="text.primary">
							Simulate Update
						</Typography>
						<Typography variant="body2" color="text.secondary">
							Trigger a fake update
						</Typography>
						<Button variant="contained" sx={{ mt: 1 }} onClick={simulateUpdate}>
							Simulate Update
						</Button>
					</Card>
				</Grid>

				<Grid size={{ xs: 12, sm: 4, md: 4 }} sx={{ display: "flex", justifyContent: "center" }}>
					<Card sx={{ p: 2, flexGrow: 1 }}>
						<Typography variant="h5" color="text.primary">
							Current Snackbars
						</Typography>
						<List sx={{ width: "100%", bgcolor: "background.paper" }}>
							{Object.keys(snackbarList).map((id) => (
								<ListItem key={id}>
									<ListItemText primary={`Snackbar ID: ${id}`} />
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
