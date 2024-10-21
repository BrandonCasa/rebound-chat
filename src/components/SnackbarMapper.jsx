import { Alert, Snackbar, useTheme } from "@mui/material";
import { removeSnackbar } from "slices/snackbarSlice";
import React from "react";
import { useDispatch, useSelector } from "react-redux";

function SnackbarMapper({ drawerWidth, drawerOpen }) {
	const snackbarsState = useSelector((state) => state.snackbars);
	const dispatch = useDispatch();
	const theme = useTheme();

	const snackbarComponents = Object.entries(snackbarsState.snackbarList).map(([snackbarId, snackbarData], index) => {
		const onCloseAction = (_, reason) => {
			if (reason === "timeout") dispatch(removeSnackbar({ snackbarId }));
		};

		const snackbarStyle = {
			bottom: `${index * 56 + 16}px`,
			left: `${drawerOpen ? drawerWidth + 16 : 16}px`,
			transition: theme.transitions.create("left", {
				duration: drawerOpen ? theme.transitions.duration.enteringScreen : theme.transitions.duration.leavingScreen,
				easing: drawerOpen ? theme.transitions.easing.easeOut : theme.transitions.easing.sharp,
			}),
		};

		return (
			<Snackbar
				open={snackbarData.snackbarProps.open}
				autoHideDuration={snackbarData.snackbarProps.autoHideDuration}
				onClose={onCloseAction}
				key={snackbarId}
				anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
				style={snackbarStyle}
			>
				<Alert {...snackbarData.alertProps}>{snackbarData.childText}</Alert>
			</Snackbar>
		);
	});

	return <>{snackbarComponents}</>;
}

export default SnackbarMapper;
