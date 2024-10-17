import { createSlice } from "@reduxjs/toolkit";

const initialState = {
	snackbarList: [],
};
// [snackbarMsg, snackbarType, autoHideDuration, onCloseCallback]
const snackbarSlice = createSlice({
	name: "snackbars",
	initialState,
	reducers: {
		addSnackbar: (state, action) => {
			state.snackbarList.push({
				snackbarProps: {
					open: true,
					autoHideDuration: action.payload.autoHideDuration,
					onClose: action.payload.onCloseCallback, // should be a dispatch to removeSnackbar
				},
				alertProps: { severity: action.payload.severity, variant: "filled", sx: { width: "100%" } },
				childText: action.payload.message,
			});
		},
	},
});

export const { addSnackbar } = snackbarSlice.actions;
export default snackbarSlice.reducer;
