import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import { io } from "socket.io-client";

const initialState = {
	socketURL: process.env.NODE_ENV === "development" ? "http://localhost:6002" : globalThis.IN_ELECTRON_ENV ? "https://rebound.nexus" : "",
	socketClient: null,
	status: "idle", // "idle" | "connecting" | "connected" | "error"
	error: null,
	connected: false,
};

export const connectSocket = createAsyncThunk("socketApi/connectSocket", async ({ socketURL, userToken } = {}, { getState, rejectWithValue }) => {
	try {
		const state = getState();
		const current = state.sockets?.socketClient;

		if (current?.connected) return { socketClient: current };

		const url = socketURL ?? state.sockets?.socketURL;
		if (!url) return rejectWithValue("Missing socketURL");

		const token = userToken ?? state.auth?.authToken ?? state.auth?.token;
		if (!token) return rejectWithValue("Missing user token");

		if (current) {
			try {
				current.disconnect();
				current.close?.();
			} catch {}
		}

		const client = io(url, {
			autoConnect: true,
			transports: ["websocket"],
			extraHeaders: { Authorization: `Bearer ${token}` },
		});

		return { socketClient: client };
	} catch (err) {
		return rejectWithValue(err?.response?.data || err?.message || String(err));
	}
});

export const disconnectSocket = createAsyncThunk("socketApi/disconnectSocket", async (_, { getState }) => {
	const client = getState().sockets?.socketClient;
	if (client) {
		try {
			client.disconnect();
			client.close?.();
		} catch {}
	}
	return true;
});

const socketSlice = createSlice({
	name: "sockets",
	initialState,
	reducers: {
		setConnected(state, action) {
			state.connected = !!action.payload;
			state.status = state.connected ? "connected" : "idle";
			if (!state.connected) state.socketClient = state.socketClient;
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
			.addCase(connectSocket.fulfilled, (state, action) => {
				state.socketClient = action.payload.socketClient;
				state.connected = !!action.payload.socketClient?.connected;
				state.status = state.connected ? "connected" : "idle";
			})
			.addCase(connectSocket.rejected, (state, action) => {
				state.status = "error";
				state.error = action.payload || action.error?.message || "Failed to connect socket";
				state.connected = false;
			})
			.addCase(disconnectSocket.fulfilled, (state) => {
				state.socketClient = null;
				state.connected = false;
				state.status = "idle";
				state.error = null;
			});
	},
});

export const { setConnected, setSocketURL, clearSocketError } = socketSlice.actions;
export default socketSlice.reducer;
