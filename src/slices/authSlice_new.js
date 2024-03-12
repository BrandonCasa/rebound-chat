// slices/authSlice.js
import { createSlice } from "@reduxjs/toolkit";
import { authApi } from "../services/authApi";

const initialState = {
  user: null,
  token: window.localStorage.getItem("auth-token"),
  isLoggingIn: false,
};

const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    logout: (state) => {
      state.user = null;
      state.token = null;
      state.isLoggingIn = false;
      window.localStorage.removeItem("auth-token");
    },
  },
  extraReducers: (builder) => {
    builder.addMatcher(authApi.endpoints.loginUser.matchPending, (state, { payload }) => {
      state.isLoggingIn = true;
    });
    builder.addMatcher(authApi.endpoints.loginUser.matchFulfilled, (state, { payload }) => {
      state.user = payload;
      state.token = payload.token;
      state.isLoggingIn = false;
      window.localStorage.setItem("auth-token", payload.token);
    });

    builder.addMatcher(authApi.endpoints.verifyUser.matchPending, (state, { payload }) => {
      state.isLoggingIn = true;
    });
    builder.addMatcher(authApi.endpoints.verifyUser.matchFulfilled, (state, { payload }) => {
      state.user = payload;
      state.token = payload.token;
      state.isLoggingIn = false;
    });
  },
});

export const { logout } = authSlice.actions;
export default authSlice.reducer;
