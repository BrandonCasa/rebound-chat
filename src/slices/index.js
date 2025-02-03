import { combineReducers } from "@reduxjs/toolkit";
import dialogReducer from "./dialogSlice";
import authReducer from "./authSlice";
import socketReducer from "./socketSlice";
import snackbarReducer from "./snackbarSlice";

const rootReducer = combineReducers({
	dialogs: dialogReducer,
	auth: authReducer,
	socket: socketReducer,
	snackbars: snackbarReducer,
});

export default rootReducer;
