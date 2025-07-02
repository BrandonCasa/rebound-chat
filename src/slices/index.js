import { combineReducers } from "@reduxjs/toolkit";

import authReducer from "./authSlice";
import dialogReducer from "./dialogSlice";
import settingsReducer from "./settingsSlice";
import snackbarReducer from "./snackbarSlice";
import userApiReducer from "./userApiSlice";
import chatApiReducer from "./chatApiSlice";
import dmApiReducer from "./dmApiSlice";
import voiceChatReducer from "./voiceChatSlice";

const rootReducer = combineReducers({
	dialogs: dialogReducer,
	auth: authReducer,
	snackbars: snackbarReducer,
	settings: settingsReducer,
	userApi: userApiReducer,
	chatApi: chatApiReducer,
	dmApi: dmApiReducer,
	voiceChat: voiceChatReducer,
});

export default rootReducer;
