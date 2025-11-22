import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import axios from "axios";
import { buildApiConfig, getApiBase } from "../helpers/api";
import { profileMediaUrl } from "../helpers/mediaUrl";

const base = getApiBase();

export const mapMessages = (msgs) =>
	msgs.map((m) => ({
		...m,
		sender: {
			...m.sender,
			avatarUrl: profileMediaUrl(m?.sender?.avatarUrl, "defaultpfp.webp"),
		},
	}));

export const fetchRoomMessages = createAsyncThunk("chatApi/fetchRoomMessages", async ({ roomId, authToken }, { rejectWithValue }) => {
	try {
                const { data } = await axios.get(
                        `${base}/rooms/${roomId}/messages`,
                        buildApiConfig(authToken)
                );
		return { roomId, messages: await mapMessages(data.messages) };
	} catch (err) {
		return rejectWithValue(err.response?.data || err.message);
	}
});

const chatApiSlice = createSlice({
	name: "chatApi",
	initialState: { messages: {} },
	reducers: {
		clearMessages(state, action) {
			if (action.payload?.roomId) {
				delete state.messages[action.payload.roomId];
			} else {
				state.messages = {};
			}
		},
	},
	extraReducers: (builder) => {
		builder.addCase(fetchRoomMessages.fulfilled, (state, action) => {
			state.messages[action.payload.roomId] = action.payload.messages;
		});
	},
});

export const { clearMessages } = chatApiSlice.actions;
export default chatApiSlice.reducer;
