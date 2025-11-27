import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import { getSocketClient, initSocketClient, tearDownSocketClient, updateSocketAuthToken } from "../helpers/socketClient";

let lifecycleHandlers = null;

const initialState = {
	socketURL: process.env.NODE_ENV === "development" ? "http://localhost:6002" : globalThis.IN_ELECTRON_ENV ? "https://rebound.nexus" : "",
	status: "idle", // "idle" | "connecting" | "connected" | "error"
	error: null,
	connected: false,
	currentRoom: null,
};

const attachLifecycleHandlers = (dispatch) => {
	const socket = getSocketClient();
	if (!socket) return;

	if (lifecycleHandlers) {
		socket.off("connect", lifecycleHandlers.onConnected);
		socket.off("disconnect", lifecycleHandlers.onDisconnected);
		socket.off("connected", lifecycleHandlers.onConnected);
	}

	const onConnected = () => dispatch(setConnected(true));
	const onDisconnected = () => dispatch(setConnected(false));

	lifecycleHandlers = { onConnected, onDisconnected };
	socket.on("connect", onConnected);
	socket.on("disconnect", onDisconnected);
	socket.on("connected", onConnected);

	if (socket.connected) {
		onConnected();
	}
};

const detachLifecycleHandlers = () => {
	const socket = getSocketClient();
	if (!socket || !lifecycleHandlers) return;
	socket.off("connect", lifecycleHandlers.onConnected);
	socket.off("disconnect", lifecycleHandlers.onDisconnected);
	socket.off("connected", lifecycleHandlers.onConnected);
	lifecycleHandlers = null;
};

export const connectSocket = createAsyncThunk("socketApi/connectSocket", async ({ socketURL, userToken } = {}, { getState, dispatch, rejectWithValue }) => {
	try {
		const state = getState();
		const url = socketURL ?? state.sockets?.socketURL;
		const token = userToken ?? state.auth?.authToken ?? state.auth?.token ?? null;

		if (!url) return rejectWithValue("Missing socketURL");

		const existing = getSocketClient();
		if (existing?.connected) {
			updateSocketAuthToken(token);
			attachLifecycleHandlers(dispatch);
			return { reused: true };
		}

		initSocketClient(url, token);
		attachLifecycleHandlers(dispatch);

		return { reused: false };
	} catch (err) {
		return rejectWithValue(err?.response?.data || err?.message || String(err));
	}
});

export const disconnectSocket = createAsyncThunk("socketApi/disconnectSocket", async (_, { dispatch }) => {
	detachLifecycleHandlers();
	tearDownSocketClient();
	dispatch(setConnected(false));
	return true;
});

export const setActiveSocketRoom = createAsyncThunk("socketApi/setActiveSocketRoom", async ({ currentRoom, lastRoom } = {}, { getState }) => {
	const socket = getSocketClient();
	const state = getState();
	const prevRoom = lastRoom ?? state.sockets?.currentRoom ?? null;
	const nextRoom = currentRoom ?? null;

	if (socket) {
		if (prevRoom && prevRoom !== nextRoom) socket.emit("leave_room", prevRoom);
		if (nextRoom && prevRoom !== nextRoom) socket.emit("join_room", nextRoom);
	}

	return { currentRoom: nextRoom };
});

export const emitSocketEvent = createAsyncThunk("socketApi/emitSocketEvent", async ({ event, args = [] } = {}, { rejectWithValue }) => {
	const socket = getSocketClient();
	if (!socket) return rejectWithValue("Socket not connected");
	if (!event) return rejectWithValue("Missing event name");
	socket.emit(event, ...args);
	return true;
});

const socketSlice = createSlice({
	name: "sockets",
	initialState,
	reducers: {
		setConnected(state, action) {
			state.connected = !!action.payload;
			state.status = state.connected ? "connected" : "idle";
		},
		setSocketURL(state, action) {
			state.socketURL = action.payload;
		},
		clearSocketError(state) {
			state.error = null;
		},
	},
	extraReducers: (builder) => {
		builder
			.addCase(connectSocket.pending, (state) => {
				state.status = "connecting";
				state.error = null;
			})
			.addCase(connectSocket.fulfilled, (state) => {
				state.status = state.connected ? "connected" : "idle";
			})
			.addCase(connectSocket.rejected, (state, action) => {
				state.status = "error";
				state.error = action.payload || action.error?.message || "Failed to connect socket";
				state.connected = false;
			})
			.addCase(disconnectSocket.fulfilled, (state) => {
				state.connected = false;
				state.status = "idle";
				state.error = null;
				state.currentRoom = null;
			})
			.addCase(setActiveSocketRoom.fulfilled, (state, action) => {
				state.currentRoom = action.payload.currentRoom;
			});
	},
});

export const { setConnected, setSocketURL, clearSocketError } = socketSlice.actions;
export default socketSlice.reducer;
