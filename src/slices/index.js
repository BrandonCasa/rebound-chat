import { combineReducers } from "@reduxjs/toolkit";
import dialogReducer from "./dialogSlice";
import authReducer from "./authSlice";
import authNewReducer from "./authSlice_new";
import socketReducer from "./socketSlice";
import snackbarReducer from "./snackbarSlice";

const rootReducer = combineReducers({
	dialogs: dialogReducer,
	auth: authReducer,
	authNew: authNewReducer,
	socket: socketReducer,
	snackbars: snackbarReducer,
});

export default rootReducer;
