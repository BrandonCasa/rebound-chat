import { createSlice } from "@reduxjs/toolkit";

const initialState = {
  authToken: window.localStorage.getItem("auth-token"),
  loggedIn: false,
  username: "",
  displayName: "",
  loggingIn: true,
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
  },
});

export const { setAuthState, setLoggedIn, setLoggingIn } = authSlice.actions;
export default authSlice.reducer;
