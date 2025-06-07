import { createSlice } from "@reduxjs/toolkit";

import socketIoHelper from "../helpers/socket";

const initialState = {
  authToken: window.localStorage.getItem("auth-token"),
  friends: [],
  loggedIn: false,
  userId: null,
  username: "",
  displayName: "",
  bio: "",
  loggingIn: false,
  socketInfo: {
    connected: false,
    currentRoom: null,
  },
  bannerUrl: null,
  avatarUrl: null,
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
      if ("loggedIn" in action.payload) {
        state.loggingIn = false;
        state.loggedIn = action.payload.loggedIn;

        if (action.payload.loggedIn === false) {
          action.payload.authToken = null;
          action.payload.userId = null;
          action.payload.username = "";
          action.payload.displayName = "";
          action.payload.bio = "";
          action.payload.friends = [];
          state.socketInfo.currentRoom = null;
          state.bannerUrl = null;
          state.avatarUrl = null;
        }
      }
      if ("authToken" in action.payload) {
        state.authToken = action.payload.authToken;
      }
      if ("userId" in action.payload) {
        state.userId = action.payload.userId;
      }
      if ("username" in action.payload) {
        state.username = action.payload.username;
      }
      if ("displayName" in action.payload) {
        state.displayName = action.payload.displayName;
      }
      if ("bio" in action.payload) {
        state.bio = action.payload.bio;
      }
      if ("friends" in action.payload) {
        state.friends = action.payload.friends;
      }
      if ("bannerUrl" in action.payload) {
        state.bannerUrl = action.payload.bannerUrl;
      }
      if ("avatarUrl" in action.payload) {
        state.avatarUrl = action.payload.avatarUrl;
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

      const roomToLeave =
        action.payload.lastRoom || state.socketInfo.currentRoom;
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

export const {
  setAuthState,
  setLoggedIn,
  setLoggingIn,
  setSocketStatus,
  setSocketRoom,
} = authSlice.actions;
export default authSlice.reducer;
