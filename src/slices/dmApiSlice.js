import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import axios from "axios";
import { getApiBase } from "../helpers/api";
import { mapMessages } from "./chatApiSlice";

const base = getApiBase();

export const fetchDmMessages = createAsyncThunk(
  "dmApi/fetchDmMessages",
  async ({ userId, authToken }, { rejectWithValue }) => {
    try {
      const { data } = await axios.get(`${base}/dms/${userId}/messages`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      return {
        userId,
        threadId: data.threadId,
        messages: await mapMessages(data.messages),
      };
    } catch (err) {
      return rejectWithValue(err.response?.data || err.message);
    }
  }
);

const dmApiSlice = createSlice({
  name: "dmApi",
  initialState: { messages: {}, threads: {} },
  reducers: {
    clearDmMessages(state, action) {
      if (action.payload?.userId) delete state.messages[action.payload.userId];
      else state.messages = {};
    },
  },
  extraReducers: (builder) => {
    builder.addCase(fetchDmMessages.fulfilled, (state, action) => {
      state.messages[action.payload.userId] = action.payload.messages;
      state.threads[action.payload.userId] = action.payload.threadId;
    });
  },
});

export const { clearDmMessages } = dmApiSlice.actions;
export default dmApiSlice.reducer;
