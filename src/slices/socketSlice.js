import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import { io } from "socket.io-client";

// Async thunk for connecting to the socket
export const initializeSocketConnection = createAsyncThunk("socket/connect", async (token, { dispatch }) => {
  const socketURL = process.env.NODE_ENV === "production" ? undefined : "http://localhost:6002";
  const socket = io(socketURL, {
    autoConnect: true,
    query: { token },
  });

  socket.on("connect", () => {
    dispatch(setSocketConnected(true));
  });

  socket.on("disconnect", () => {
    dispatch(setSocketConnected(false));
  });

  return socket; // Payload
});

const socketSlice = createSlice({
  name: "socket",
  initialState: {
    socket: null, // Instance of the socket
    connected: false,
  },
  reducers: {
    setSocketConnected: (state, action) => {
      state.connected = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder.addCase(initializeSocketConnection.fulfilled, (state, action) => {
      state.socket = action.payload;
    });
  },
});

export const { setSocketConnected } = socketSlice.actions;
export default socketSlice.reducer;
