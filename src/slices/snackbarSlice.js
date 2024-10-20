import { createSlice } from "@reduxjs/toolkit";

const initialState = {
	snackbarList: {},
};

const snackbarSlice = createSlice({
	name: "snackbars",
	initialState,
	reducers: {
		removeSnackbar: (state, action) => {
			// action.payload = {snackbarId}
			delete state.snackbarList[action.payload.snackbarId];
		},
		addSnackbar: (state, action) => {
			// [snackbarMsg, snackbarSeverity, autoHideDuration]
			const snackbarNewId = new Date().getTime();
			state.snackbarList[snackbarNewId] = {
				snackbarProps: {
					open: true,
					autoHideDuration: action.payload.autoHideDuration,
				},
				alertProps: { severity: action.payload.snackbarSeverity, variant: action.payload?.snackbarVariant || "filled", sx: { width: "100%" } },
				childText: action.payload.snackbarMsg,
			};
		},
	},
});

export const { addSnackbar, removeSnackbar } = snackbarSlice.actions;
export default snackbarSlice.reducer;
