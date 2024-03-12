import { combineReducers } from "@reduxjs/toolkit";
import dialogReducer from "./dialogSlice";
import authReducer from "./authSlice";
import socketReducer from "./socketSlice";

const rootReducer = combineReducers({
  dialogs: dialogReducer,
  auth: authReducer,
  socket: socketReducer,
});

export default rootReducer;
