import { createSlice } from "@reduxjs/toolkit";
import merge from "lodash.merge";

const initialState = {
  overrides: {},
};

const settingsSlice = createSlice({
  name: "settings",
  initialState,
  reducers: {
    updateThemeOverride(state, action) {
      state.overrides = merge({}, state.overrides, action.payload);
    },
    resetThemeOverrides(state) {
      state.overrides = {};
    },
  },
});

export const { updateThemeOverride, resetThemeOverrides } = settingsSlice.actions;
export default settingsSlice.reducer;