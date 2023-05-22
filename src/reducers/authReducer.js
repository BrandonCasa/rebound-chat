import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  authToken: window.localStorage.getItem("auth-token"),
  loggedIn: false,
};

const authSlice = createSlice({
  name: 'auth',
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
    }
  },
});

export const { setAuthState, setLoggedIn } = authSlice.actions;
export default authSlice.reducer;