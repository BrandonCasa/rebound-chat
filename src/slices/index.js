import { combineReducers } from "@reduxjs/toolkit";

import authReducer from "./authSlice";
import dialogReducer from "./dialogSlice";
import settingsReducer from "./settingsSlice";
import snackbarReducer from "./snackbarSlice";

const rootReducer = combineReducers({
	dialogs: dialogReducer,
	auth: authReducer,
	snackbars: snackbarReducer,
	settings: settingsReducer,
});

export default rootReducer;
