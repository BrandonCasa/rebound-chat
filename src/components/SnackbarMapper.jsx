import { Alert, Snackbar } from "@mui/material";
import { removeSnackbar } from "slices/snackbarSlice";
import React, { useMemo } from "react";
import { useDispatch, useSelector } from "react-redux";

function SnackbarMapper() {
	const snackbarsState = useSelector((state) => state.snackbars);
	const dispatch = useDispatch();

	const snackbarComponents = useMemo(() => {
		return Object.entries(snackbarsState.snackbarList).map(([snackbarId, snackbarData]) => {
			const onCloseAction = () => {
				dispatch(removeSnackbar({ snackbarId }));
			};

			return (
				<Snackbar open={snackbarData.snackbarProps.open} autoHideDuration={snackbarData.snackbarProps.autoHideDuration} onClose={onCloseAction} key={snackbarId}>
					<Alert onClose={onCloseAction} {...snackbarData.alertProps}>
						{snackbarData.childText}
					</Alert>
				</Snackbar>
			);
		});
	}, [snackbarsState.snackbarList, dispatch]);

	return snackbarComponents;
}

export default SnackbarMapper;
