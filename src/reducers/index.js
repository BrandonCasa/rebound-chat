import { combineReducers } from '@reduxjs/toolkit';
import dialogReducer from "./dialogReducer";
import authReducer from "./authReducer";

const rootReducer = combineReducers({
  dialogs: dialogReducer,
  auth: authReducer,
  // Add other reducers here as your app grows
});

export default rootReducer;