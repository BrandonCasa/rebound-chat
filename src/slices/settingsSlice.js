import { createSlice } from "@reduxjs/toolkit";
import { merge } from "lodash";

const initialState = {
  overrides: JSON.parse(window.localStorage.getItem("themeOverrides") || "{}"),
};

const settingsSlice = createSlice({
  name: "settings",
  initialState,
  reducers: {
    updateThemeOverride(state, action) {
      //const newOverrides = merge({}, state.overrides, action.payload);
      //state.overrides = newOverrides;
      state.overrides = merge({}, state.overrides, action.payload);
      window.localStorage.setItem(
        "themeOverrides",
        JSON.stringify(state.overrides),
      );
    },
    resetThemeOverrides(state) {
      state.overrides = {};
      window.localStorage.setItem(
        "themeOverrides",
        JSON.stringify(state.overrides),
      );
    },
  },
});

export const { updateThemeOverride, resetThemeOverrides } =
  settingsSlice.actions;
export default settingsSlice.reducer;
