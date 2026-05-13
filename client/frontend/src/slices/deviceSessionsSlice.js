import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import axios from "axios";

import { buildApiConfig, buildCsrfApiConfig, getApiBase } from "../helpers/api";
import { addSnackbar } from "./snackbarSlice";
import { logoutUser, setLoggedIn } from "./authSlice";

const base = getApiBase();

const normalizeSession = (session) => {
	const locationParts = [session?.city, session?.region, session?.country].filter(Boolean).join(", ");
	const deviceType = session?.userAgentDeviceType ?? session?.deviceType ?? session?.clientType;
	const userAgentDisplay = session?.userAgentParsed ?? session?.user_agent_parsed ?? session?.userAgent ?? session?.user_agent ?? session?.client;

	return {
		id: session?.id ?? session?._id ?? session?.sessionId ?? session?.sid ?? session?.token,
		userAgent: userAgentDisplay ?? "Unknown client",
		userAgentParsed: userAgentDisplay ?? "Unknown client",
		userAgentDeviceType: deviceType ?? "desktop",
		deviceName: session?.deviceName ?? session?.device_name ?? session?.device ?? session?.platform ?? userAgentDisplay ?? "Unknown device",
		location: session?.location ?? locationParts ?? "Unknown location",
		ipAddress: session?.ipAddress ?? session?.ip ?? session?.ip_address ?? "Unknown",
		lastActive: session?.lastActive ?? session?.lastActiveAt ?? session?.updatedAt ?? session?.createdAt,
		isCurrent: Boolean(session?.isCurrent ?? session?.current ?? false),
	};
};

const normalizeSessions = (sessions) => (Array.isArray(sessions) ? sessions : []).map(normalizeSession).filter((session) => session.id);

export const fetchDeviceSessions = createAsyncThunk("deviceSessions/fetchDeviceSessions", async (_, { getState, rejectWithValue }) => {
	const { authToken, loggedIn } = getState().auth;

	if (!loggedIn || !authToken) {
		return rejectWithValue("Not authenticated");
	}

	try {
		const { data } = await axios.get(`${base}/users/sessions`, buildApiConfig(authToken));
		const payload = Array.isArray(data?.sessions) ? data.sessions : data;

		return normalizeSessions(payload);
	} catch (err) {
		return rejectWithValue(err.response?.data || err.message);
	}
});

export const revokeDeviceSession = createAsyncThunk("deviceSessions/revokeDeviceSession", async (sessionId, { dispatch, getState, rejectWithValue }) => {
	const authToken = getState().auth.authToken;

	try {
		await axios.delete(`${base}/users/sessions/${sessionId}`, await buildCsrfApiConfig(authToken));
		dispatch(
			addSnackbar({
				snackbarMsg: "Device logged out",
				snackbarSeverity: "success",
				autoHideDuration: 3000,
			})
		);
		return sessionId;
	} catch (err) {
		dispatch(
			addSnackbar({
				snackbarMsg: "Failed to revoke device",
				snackbarSeverity: "error",
				autoHideDuration: 4000,
			})
		);
		return rejectWithValue(err.response?.data || err.message);
	}
});

export const revokeOtherDeviceSessions = createAsyncThunk("deviceSessions/revokeOtherDeviceSessions", async (_, { dispatch, getState, rejectWithValue }) => {
	const authToken = getState().auth.authToken;

	try {
		await axios.delete(`${base}/users/sessions`, await buildCsrfApiConfig(authToken, { params: { scope: "others" } }));
		dispatch(
			addSnackbar({
				snackbarMsg: "Logged out of other devices",
				snackbarSeverity: "warning",
				autoHideDuration: 4000,
			})
		);
		return true;
	} catch (err) {
		dispatch(
			addSnackbar({
				snackbarMsg: "Failed to revoke devices",
				snackbarSeverity: "error",
				autoHideDuration: 4000,
			})
		);
		return rejectWithValue(err.response?.data || err.message);
	}
});

const deviceSessionsSlice = createSlice({
	name: "deviceSessions",
	initialState: { sessions: [], loading: false, error: null },
	reducers: {},
	extraReducers: (builder) => {
		builder
			.addCase(fetchDeviceSessions.pending, (state) => {
				state.loading = true;
				state.error = null;
			})
			.addCase(fetchDeviceSessions.fulfilled, (state, action) => {
				state.loading = false;
				state.sessions = action.payload;
			})
			.addCase(fetchDeviceSessions.rejected, (state, action) => {
				state.loading = false;
				if (action.payload === "Not authenticated") {
					state.sessions = [];
					state.error = null;
					return;
				}
				state.error = action.payload || "Failed to load devices";
			})
			.addCase(revokeDeviceSession.pending, (state) => {
				state.loading = true;
				state.error = null;
			})
			.addCase(revokeDeviceSession.fulfilled, (state, action) => {
				state.loading = false;
				state.sessions = state.sessions.filter((session) => session.id !== action.payload);
			})
			.addCase(revokeDeviceSession.rejected, (state, action) => {
				state.loading = false;
				state.error = action.payload || "Failed to revoke device";
			})
			.addCase(revokeOtherDeviceSessions.pending, (state) => {
				state.loading = true;
				state.error = null;
			})
			.addCase(revokeOtherDeviceSessions.fulfilled, (state) => {
				state.loading = false;
				state.sessions = state.sessions.filter((session) => session.isCurrent);
			})
			.addCase(revokeOtherDeviceSessions.rejected, (state, action) => {
				state.loading = false;
				state.error = action.payload || "Failed to revoke devices";
			})
			.addCase(logoutUser.fulfilled, (state) => {
				state.sessions = [];
				state.loading = false;
				state.error = null;
			})
			.addCase(logoutUser.rejected, (state) => {
				state.sessions = [];
				state.loading = false;
			})
			.addCase(setLoggedIn, (state, action) => {
				if (action.payload?.loggedIn === false) {
					state.sessions = [];
					state.loading = false;
					state.error = null;
				}
			});
	},
});

export default deviceSessionsSlice.reducer;
