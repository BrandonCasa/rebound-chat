import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  loginDialogOpen: false,
};

const dialogSlice = createSlice({
  name: 'dialogs',
  initialState,
  reducers: {
    setDialogOpened: (state, action) => {
      if (action.payload.conflictingDialogs !== undefined) {
        if (action.payload.newState) {
          for (let dialog in state) {
            if (action.payload.conflictingDialogs.includes(dialog)) {
              state[dialog] = false;
            }
          }
        }
      }
      if (action.payload.dialogName in state) {
        state[action.payload.dialogName] = action.payload.newState;
      }
    },
  },
});

export const { setDialogOpened } = dialogSlice.actions;
export default dialogSlice.reducer;