import { createSlice } from "@reduxjs/toolkit";

const initialState = {
  authToken: window.localStorage.getItem("auth-token"),
  loggedIn: false,
  username: "",
  displayName: "",
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
      }
      if (action.payload.username !== undefined) {
        state.username = action.payload.username;
      }
      if (action.payload.displayName !== undefined) {
        state.displayName = action.payload.displayName;
      }
    },
  },
});

export const { setAuthState, setLoggedIn } = authSlice.actions;
export default authSlice.reducer;
