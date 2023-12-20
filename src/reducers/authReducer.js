import { createSlice } from "@reduxjs/toolkit";
import socketIoHelper from "helpers/socket";

const initialState = {
  authToken: window.localStorage.getItem("auth-token"),
  loggedIn: false,
  username: "",
  displayName: "",
  loggingIn: true,
  socketInfo: {
    connected: false,
    currentRoom: null,
  },
};

const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    setAuthState: (state, action) => {
      if (action.payload.authToken !== undefined) {
        state.authToken = action.payload.authToken;
      }
    },
    setLoggedIn: (state, action) => {
      if (action.payload.loggedIn !== undefined) {
        state.loggedIn = action.payload.loggedIn;
        state.loggingIn = false;
      }
      if (action.payload.token !== undefined) {
        state.authTokenState = action.payload.token;
      }
      if (action.payload.username !== undefined) {
        state.username = action.payload.username;
      }
      if (action.payload.displayName !== undefined) {
        state.displayName = action.payload.displayName;
      }
    },
    setLoggingIn: (state, action) => {
      state.loggingIn = action.payload.loggingIn;
    },
    setSocketStatus: (state, action) => {
      state.socketInfo.connected = action.payload.connected;
    },
    setSocketRoom: (state, action) => {
      if (action.payload.currentRoom === null) {
        if (action.payload.lastRoom !== null) {
          const socketClient = socketIoHelper.getSocket();

          socketClient.emit("leave_room", action.payload.lastRoom);
          state.socketInfo.currentRoom = null;
        }
      } else {
        if (action.payload.lastRoom !== action.payload.currentRoom) {
          const socketClient = socketIoHelper.getSocket();

          if (action.payload.lastRoom !== null) {
            socketClient.emit("leave_room", action.payload.lastRoom);
          }

          socketClient.emit("join_room", action.payload.currentRoom);
          state.socketInfo.currentRoom = action.payload.currentRoom;
        }
      }
    },
  },
});

export const { setAuthState, setLoggedIn, setLoggingIn, setSocketStatus, setSocketRoom } = authSlice.actions;
export default authSlice.reducer;
