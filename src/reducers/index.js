import { combineReducers } from '@reduxjs/toolkit';
import dialogReducer from "./dialogReducer";

const rootReducer = combineReducers({
  dialogs: dialogReducer,
  // Add other reducers here as your app grows
});

export default rootReducer;