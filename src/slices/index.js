import { combineReducers } from "@reduxjs/toolkit";

import authReducer from "./authSlice";
import dialogReducer from "./dialogSlice";
import settingsReducer from "./settingsSlice";
import snackbarReducer from "./snackbarSlice";
import socketReducer from "./socketSlice";

const rootReducer = combineReducers({
  dialogs: dialogReducer,
  auth: authReducer,
  socket: socketReducer,
  snackbars: snackbarReducer,
  settings: settingsReducer,
});

export default rootReducer;
