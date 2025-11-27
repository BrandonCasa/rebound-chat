import { configureStore } from "@reduxjs/toolkit";
import { setupListeners } from "@reduxjs/toolkit/query";

import rootReducer from "./slices";

const store = configureStore({
	reducer: rootReducer,
	middleware: (getDefaultMiddleware) =>
		getDefaultMiddleware({
			serializableCheck: {
				// ignore the socket instance in state
				ignoredPaths: ["sockets.socketClient"],

				// OR (more robust) ignore that field anywhere in action payloads
				ignoredActionPaths: ["payload.socketClient"],
			},
		}),
});

setupListeners(store.dispatch);

export default store;
