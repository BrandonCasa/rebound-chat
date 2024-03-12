import { createSlice } from "@reduxjs/toolkit";
import socketIoHelper from "helpers/socket";

const initialState = {
  authToken: window.localStorage.getItem("auth-token"),
  friends: [],
  loggedIn: false,
  userId: null,
  username: "",
  displayName: "",
  bio: "",
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
      if (action.payload.authToken !== undefined) {
        state.authToken = action.payload.authToken;
      }
      if (action.payload.userId !== undefined) {
        state.userId = action.payload.userId;
      }
      if (action.payload.username !== undefined) {
        state.username = action.payload.username;
      }
      if (action.payload.displayName !== undefined) {
        state.displayName = action.payload.displayName;
      }
      if (action.payload.bio !== undefined) {
        state.bio = action.payload.bio;
      }
      if (action.payload.friends !== undefined) {
        state.friends = action.payload.friends;
      }
    },
    setLoggingIn: (state, action) => {
      state.loggingIn = action.payload.loggingIn;
    },
    setSocketStatus: (state, action) => {
      state.socketInfo.connected = action.payload.connected;
    },
    setSocketRoom: (state, action) => {
      const socketClient = socketIoHelper.getSocket();

      const roomToLeave = action.payload.lastRoom || state.socketInfo.currentRoom;
      const roomToJoin = action.payload.currentRoom;

      if (roomToLeave) {
        socketClient.emit("leave_room", roomToLeave);
        state.socketInfo.currentRoom = null;
      }

      if (roomToJoin) {
        socketClient.emit("join_room", roomToJoin);
        state.socketInfo.currentRoom = roomToJoin;
      }
    },
  },
});

export const { setAuthState, setLoggedIn, setLoggingIn, setSocketStatus, setSocketRoom } = authSlice.actions;
export default authSlice.reducer;
