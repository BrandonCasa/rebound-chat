import { Alert, Snackbar, Typography } from "@mui/material";
import { removeSnackbar } from "slices/snackbarSlice";
import React, { useCallback, useEffect, useState, useMemo } from "react";
import { useDispatch, useSelector } from "react-redux";

function SnackbarMapper() {
	const snackbarsState = useSelector((state) => state.snackbars);
	const dispatch = useDispatch();
	const [snackbarComponents, setSnackbarComponents] = useState([]);

	const computeSnackbars = useMemo(() => {
		let newSnackbarComponents = [];
		Object.keys(snackbarsState.snackbarList).forEach((snackbarId) => {
			const snackbarData = snackbarsState.snackbarList[snackbarId];

			const onCloseAction = () => {
				dispatch(removeSnackbar({ snackbarId: snackbarId }));
			};

			newSnackbarComponents.push(
				<Snackbar open={snackbarData.snackbarProps.open} autoHideDuration={snackbarData.snackbarProps.autoHideDuration} onClose={onCloseAction} key={snackbarId}>
					<Alert onClose={onCloseAction} {...snackbarData.alertProps}>
						{snackbarData.childText}
					</Alert>
				</Snackbar>
			);
		});
		return newSnackbarComponents;
	}, [snackbarsState.snackbarList]);

	useEffect(() => {
		setSnackbarComponents(computeSnackbars);

		return () => {
			setSnackbarComponents([]);
		};
	}, [computeSnackbars]);

	return snackbarComponents;
}

export default SnackbarMapper;
