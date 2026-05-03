import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import axios from "axios";
import { addSnackbar } from "./snackbarSlice";
import { buildApiConfig, buildCsrfApiConfig, getApiBase } from "../helpers/api";
import { profileMediaUrl } from "../helpers/mediaUrl";

const initialState = {
	profiles: {},
};

export const fetchUserProfile = createAsyncThunk("userApi/fetchUserProfile", async ({ userId, authToken } = {}, { rejectWithValue }) => {
	const base = getApiBase();
	try {
		const { data } = await axios.get(`${base}/users/profile`, buildApiConfig(authToken, { params: userId ? { id: userId } : undefined }));
		const u = data.user;

		return {
			id: u.id,
			profile: {
				...u,
				bannerUrl: profileMediaUrl(u.bannerUrl, "banner.webp"),
				avatarUrl: profileMediaUrl(u.avatarUrl, "defaultpfp.webp"),
			},
		};
	} catch (err) {
		return rejectWithValue(err.response?.data || err.message);
	}
});

export const modifyProfile = createAsyncThunk("userApi/modifyProfile", async ({ formData, authToken }, { rejectWithValue }) => {
	const base = getApiBase();
	try {
		const { data } = await axios.put(`${base}/users/modify`, formData, await buildCsrfApiConfig(authToken));
		const u = data.user;
		return {
			id: u.id,
			profile: {
				...u,
				bannerUrl: profileMediaUrl(u.bannerUrl, "banner.webp"),
				avatarUrl: profileMediaUrl(u.avatarUrl, "defaultpfp.webp"),
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
			await axios.put(`${base}/users/${ep}`, data, await buildCsrfApiConfig(authToken));
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
