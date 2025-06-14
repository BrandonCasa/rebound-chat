import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import axios from "axios";
import { addSnackbar } from "./snackbarSlice";
import { getApiBase } from "../helpers/api";

const initialState = {
	profiles: {},
};

export const fetchUserProfile = createAsyncThunk("userApi/fetchUserProfile", async ({ userId, authToken } = {}, { rejectWithValue }) => {
	const base = getApiBase();
	try {
		const { data } = await axios.get(`${base}/users/profile`, {
			headers: { Authorization: `Bearer ${authToken}` },
			params: userId ? { id: userId } : undefined,
		});
		const u = data.user;
		return {
			id: u.id,
			profile: {
				...u,
				avatarUrl: u.avatarUrl ? base + u.avatarUrl : null,
				bannerUrl: u.bannerUrl ? base + u.bannerUrl : null,
			},
		};
	} catch (err) {
		return rejectWithValue(err.response?.data || err.message);
	}
});

export const modifyProfile = createAsyncThunk("userApi/modifyProfile", async ({ formData, authToken }, { rejectWithValue }) => {
	const base = getApiBase();
	try {
		const { data } = await axios.put(`${base}/users/modify`, formData, {
			headers: { Authorization: `Bearer ${authToken}` },
		});
		const u = data.user;
		return {
			id: u.id,
			profile: {
				...u,
				avatarUrl: u.avatarUrl ? base + u.avatarUrl : null,
				bannerUrl: u.bannerUrl ? base + u.bannerUrl : null,
			},
		};
	} catch (err) {
		return rejectWithValue(err.response?.data || err.message);
	}
});

export const friendAction = createAsyncThunk(
	"userApi/friendAction",
	async ({ ep, data, authToken, message, severity = "success" }, { dispatch, rejectWithValue }) => {
		const base = getApiBase();
		try {
			await axios.put(`${base}/users/${ep}`, data, {
				headers: { Authorization: `Bearer ${authToken}` },
			});
			if (message) {
				dispatch(addSnackbar({ snackbarMsg: message, snackbarSeverity: severity, autoHideDuration: 1500 }));
			}
			return true;
		} catch (err) {
			dispatch(addSnackbar({ snackbarMsg: "Error", snackbarSeverity: "error", autoHideDuration: 1500 }));
			return rejectWithValue(err.response?.data || err.message);
		}
	}
);

const userApiSlice = createSlice({
	name: "userApi",
	initialState,
	reducers: {},
	extraReducers: (builder) => {
		builder
			.addCase(fetchUserProfile.fulfilled, (state, action) => {
				state.profiles[action.payload.id] = action.payload.profile;
			})
			.addCase(modifyProfile.fulfilled, (state, action) => {
				state.profiles[action.payload.id] = action.payload.profile;
			});
	},
});

export default userApiSlice.reducer;
