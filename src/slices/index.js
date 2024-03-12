import { combineReducers } from "@reduxjs/toolkit";
import dialogReducer from "./dialogSlice";
import authReducer from "./authSlice";

const rootReducer = combineReducers({
  dialogs: dialogReducer,
  auth: authReducer,
  // Add other reducers here as your app grows
});

export default rootReducer;
