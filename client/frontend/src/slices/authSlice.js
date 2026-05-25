import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import axios from "axios";

import {
	buildCsrfApiConfig,
	clearAuthCookies,
	clearAuthSessionCookie,
	getApiBase,
	hasAuthSessionCookie,
	setAuthSessionCookie,
	setCsrfTokenCookie,
} from "../helpers/api";
import { profileMediaUrl } from "../helpers/mediaUrl";

const AUTO_LOGIN_BLOCK_KEY = "disable-auto-login";
const AUTH_SESSION_MARKER = "auth-session-present";

const setAutoLoginBlocked = (blocked) => {
	if (typeof window === "undefined") return;
	if (blocked) {
		window.localStorage.setItem(AUTO_LOGIN_BLOCK_KEY, "true");
		return;
	}
	window.localStorage.removeItem(AUTO_LOGIN_BLOCK_KEY);
};

const setAuthSessionPresent = (present) => {
	if (typeof window === "undefined") return;
	if (present) {
		window.localStorage.setItem(AUTH_SESSION_MARKER, "true");
		setAuthSessionCookie();
		return;
	}
	window.localStorage.removeItem(AUTH_SESSION_MARKER);
	clearAuthSessionCookie();
};

const resetAuthFields = (state) => {
	state.authToken = null;
	state.userId = null;
	state.username = "";
	state.displayName = "";
	state.bio = "";
	state.friends = [];
	state.createdAt = null;
	state.bannerUrl = null;
	state.avatarUrl = null;
	state.allowNSFW = false;
	state.allowAnyNotifications = true;
	state.allowPublicChatNotifications = true;
	state.allowPrivateChatNotifications = true;
};

const applyLoggedOutState = (state, disableAutoLogin = false) => {
	clearAuthCookies();
	setAuthSessionPresent(false);
	resetAuthFields(state);
	state.loggingIn = false;
	state.loggedIn = false;
	state.initialized = true;
	state.refreshing = false;
	state.skipAutoLogin = Boolean(disableAutoLogin);
	if (disableAutoLogin) {
		state.skipAutoLogin = true;
		setAutoLoginBlocked(true);
	} else {
		setAutoLoginBlocked(false);
	}
};

const initialState = {
	authToken: null,
	friends: [],
	loggedIn: false,
	userId: null,
	username: "",
	displayName: "",
	bio: "",
	createdAt: null,
	initialized: false,
	loggingIn: false,
	refreshing: false,
	skipAutoLogin: typeof window !== "undefined" && window.localStorage.getItem(AUTO_LOGIN_BLOCK_KEY) === "true",
	bannerUrl: null,
	avatarUrl: null,
	passwordChanging: false,
	passwordChangeError: null,
	allowNSFW: false,
	allowAnyNotifications: true,
	allowPublicChatNotifications: true,
	allowPrivateChatNotifications: true,
};

export const verifyUser = createAsyncThunk("auth/verifyUser", async (token, { getState, rejectWithValue }) => {
	const base = getApiBase();
	const authToken = token || getState().auth.authToken;
	try {
		const { data } = await axios.post(`${base}/users/verify`, {}, await buildCsrfApiConfig(authToken, { headers: { "Content-Type": "application/json" } }));
		const u = data.user;

		return {
			loggedIn: true,
			authToken,
			userId: u.id,
			username: u.username,
			displayName: u.displayName,
			bio: u.bio,
			friends: u.friends,
			bannerUrl: profileMediaUrl(u.bannerUrl, "banner.webp"),
			avatarUrl: profileMediaUrl(u.avatarUrl, "defaultpfp.webp"),
			createdAt: u.createdAt,
			allowNSFW: u.allowNSFW,
			allowAnyNotifications: u.allowAnyNotifications ?? true,
			allowPublicChatNotifications: u.allowPublicChatNotifications ?? true,
			allowPrivateChatNotifications: u.allowPrivateChatNotifications ?? true,
		};
	} catch (err) {
		return rejectWithValue(err.response?.data || err.message);
	}
});

export const refreshAuthToken = createAsyncThunk("auth/refreshAuthToken", async (_, { rejectWithValue }) => {
	const base = getApiBase();
	try {
		const { data } = await axios.post(`${base}/users/refresh`, {}, await buildCsrfApiConfig(null, { headers: { "Content-Type": "application/json" } }));

		setCsrfTokenCookie(data.csrfToken);
		setAuthSessionPresent(true);
		return { authToken: data.token };
	} catch (err) {
		return rejectWithValue(err.response?.data || err.message);
	}
});

export const bootstrapAuth = createAsyncThunk("auth/bootstrapAuth", async ({ force = false } = {}, { dispatch, rejectWithValue }) => {
	try {
		const hasSessionMarker = typeof window !== "undefined" && (window.localStorage.getItem(AUTH_SESSION_MARKER) === "true" || hasAuthSessionCookie());

		if (!force && !hasSessionMarker) {
			return rejectWithValue("No prior auth session");
		}

		const { authToken } = await dispatch(refreshAuthToken()).unwrap();
		return await dispatch(verifyUser(authToken)).unwrap();
	} catch (err) {
		return rejectWithValue(err);
	}
});

export const loginUser = createAsyncThunk("auth/loginUser", async ({ email, password }, { rejectWithValue }) => {
	const base = getApiBase();
	try {
		const { data } = await axios.post(
			`${base}/users/login`,
			{
				user: { email, password },
			},
			await buildCsrfApiConfig(null, { headers: { "Content-Type": "application/json" } })
		);
		const u = data.user;
		setCsrfTokenCookie(data.csrfToken);
		setAuthSessionPresent(true);

		return {
			loggedIn: true,
			authToken: u.token,
			userId: u.id,
			username: u.username,
			displayName: u.displayName,
			bio: u.bio,
			friends: u.friends,
			bannerUrl: profileMediaUrl(u.bannerUrl, "banner.webp"),
			avatarUrl: profileMediaUrl(u.avatarUrl, "defaultpfp.webp"),
			createdAt: u.createdAt,
			allowNSFW: u.allowNSFW,
			allowAnyNotifications: u.allowAnyNotifications ?? true,
			allowPublicChatNotifications: u.allowPublicChatNotifications ?? true,
			allowPrivateChatNotifications: u.allowPrivateChatNotifications ?? true,
		};
	} catch (err) {
		return rejectWithValue(err.response?.data || err.message);
	}
});

export const changePassword = createAsyncThunk("auth/changePassword", async ({ currentPassword, newPassword }, { getState, rejectWithValue }) => {
	const base = getApiBase();
	const authToken = getState().auth.authToken;

	if (!authToken) {
		return rejectWithValue("Not authenticated");
	}

	try {
		const { data } = await axios.put(
			`${base}/users/password`,
			{ currentPassword, newPassword },
			await buildCsrfApiConfig(authToken, { headers: { "Content-Type": "application/json" } })
		);
		return data;
	} catch (err) {
		return rejectWithValue(err.response?.data || err.message);
	}
});

export const logoutUser = createAsyncThunk("auth/logoutUser", async ({ disableAutoLogin = false } = {}, { getState, rejectWithValue }) => {
	const base = getApiBase();
	const authToken = getState().auth.authToken;

	try {
		await axios.delete(`${base}/users/sessions`, await buildCsrfApiConfig(authToken, { params: { scope: "current" } }));
		clearAuthCookies();
		setAuthSessionPresent(false);
		return { disableAutoLogin };
	} catch (err) {
		clearAuthCookies();
		setAuthSessionPresent(false);
		return rejectWithValue({ error: err.response?.data || err.message, disableAutoLogin });
	}
});

export const registerUser = createAsyncThunk("auth/registerUser", async ({ username, email, displayName, bio, password }, { rejectWithValue }) => {
	const base = getApiBase();
	try {
		const { data } = await axios.post(
			`${base}/users/register`,
			{
				user: { username, email, displayName, bio, password },
			},
			await buildCsrfApiConfig(null, { headers: { "Content-Type": "application/json" } })
		);
		const u = data.user;
		setCsrfTokenCookie(data.csrfToken);
		setAuthSessionPresent(true);

		return {
			loggedIn: true,
			authToken: u.token,
			userId: u.id,
			username: u.username,
			displayName: u.displayName,
			bio: u.bio,
			friends: u.friends,
			bannerUrl: profileMediaUrl(u.bannerUrl, "banner.webp"),
			avatarUrl: profileMediaUrl(u.avatarUrl, "defaultpfp.webp"),
			createdAt: u.createdAt,
			allowNSFW: u.allowNSFW,
			allowAnyNotifications: u.allowAnyNotifications ?? true,
			allowPublicChatNotifications: u.allowPublicChatNotifications ?? true,
			allowPrivateChatNotifications: u.allowPrivateChatNotifications ?? true,
		};
	} catch (err) {
		return rejectWithValue(err.response?.data || err.message);
	}
});

const authSlice = createSlice({
	name: "auth",
	initialState,
	reducers: {
		setAuthState: (state, action) => {
			if (action.payload.authToken !== undefined) {
				state.authToken = action.payload.authToken;
				if (action.payload.authToken) {
					setAuthSessionPresent(true);
				}
			}
		},
		setLoggedIn: (state, action) => {
			if ("loggedIn" in action.payload) {
				state.loggingIn = false;
				state.loggedIn = action.payload.loggedIn;

				if (action.payload.loggedIn === false) {
					applyLoggedOutState(state, action.payload.disableAutoLogin);
				}
			}
			if (action.payload.loggedIn) {
				state.skipAutoLogin = false;
				setAutoLoginBlocked(false);
				setAuthSessionPresent(true);
			}
			if ("authToken" in action.payload) {
				state.authToken = action.payload.authToken;
			}
			if ("userId" in action.payload) {
				state.userId = action.payload.userId;
			}
			if ("username" in action.payload) {
				state.username = action.payload.username;
			}
			if ("displayName" in action.payload) {
				state.displayName = action.payload.displayName;
			}
			if ("bio" in action.payload) {
				state.bio = action.payload.bio;
			}
			if ("friends" in action.payload) {
				state.friends = action.payload.friends;
			}
			if ("createdAt" in action.payload) {
				state.createdAt = action.payload.createdAt;
			}
			if ("bannerUrl" in action.payload) {
				state.bannerUrl = action.payload.bannerUrl;
			}
			if ("avatarUrl" in action.payload) {
				state.avatarUrl = action.payload.avatarUrl;
			}
			if ("allowNSFW" in action.payload) {
				state.allowNSFW = action.payload.allowNSFW;
			}
			if ("allowAnyNotifications" in action.payload) {
				state.allowAnyNotifications = action.payload.allowAnyNotifications;
			}
			if ("allowPublicChatNotifications" in action.payload) {
				state.allowPublicChatNotifications = action.payload.allowPublicChatNotifications;
			}
			if ("allowPrivateChatNotifications" in action.payload) {
				state.allowPrivateChatNotifications = action.payload.allowPrivateChatNotifications;
			}
		},
		setLoggingIn: (state, action) => {
			state.loggingIn = action.payload.loggingIn;
		},
	},
	extraReducers: (builder) => {
		builder
			.addCase(verifyUser.pending, (state) => {
				state.loggingIn = true;
			})
			.addCase(verifyUser.fulfilled, (state, action) => {
				state.loggingIn = false;
				state.loggedIn = true;
				state.skipAutoLogin = false;
				setAutoLoginBlocked(false);
				state.initialized = true;
				state.authToken = action.payload.authToken;
				state.userId = action.payload.userId;
				state.username = action.payload.username;
				state.displayName = action.payload.displayName;
				state.bio = action.payload.bio;
				state.friends = action.payload.friends;
				state.bannerUrl = action.payload.bannerUrl;
				state.avatarUrl = action.payload.avatarUrl;
				state.createdAt = action.payload.createdAt;
				state.allowNSFW = action.payload.allowNSFW;
				state.allowAnyNotifications = action.payload.allowAnyNotifications;
				state.allowPublicChatNotifications = action.payload.allowPublicChatNotifications;
				state.allowPrivateChatNotifications = action.payload.allowPrivateChatNotifications;
				setAuthSessionPresent(true);
				setAutoLoginBlocked(false);
				return;
			})
			.addCase(verifyUser.rejected, (state) => {
				applyLoggedOutState(state);
			})
			.addCase(refreshAuthToken.pending, (state) => {
				state.refreshing = true;
				//state.loggingIn = true;
			})
			.addCase(refreshAuthToken.fulfilled, (state, action) => {
				state.refreshing = false;
				//state.loggingIn = false;
				state.authToken = action.payload.authToken;
			})
			.addCase(refreshAuthToken.rejected, (state) => {
				applyLoggedOutState(state);
			})
			.addCase(bootstrapAuth.pending, (state) => {
				state.loggingIn = true;
			})
			.addCase(bootstrapAuth.fulfilled, (state) => {
				state.loggingIn = false;
				state.initialized = true;
				state.skipAutoLogin = false;
				setAuthSessionPresent(true);
				setAutoLoginBlocked(false);
			})
			.addCase(bootstrapAuth.rejected, (state) => {
				state.loggingIn = false;
				state.initialized = true;
			})
			.addCase(registerUser.pending, (state) => {
				state.loggingIn = true;
			})
			.addCase(registerUser.fulfilled, (state, action) => {
				state.loggingIn = false;
				state.loggedIn = true;
				state.skipAutoLogin = false;
				setAuthSessionPresent(true);
				setAutoLoginBlocked(false);
				state.initialized = true;
				state.authToken = action.payload.authToken;
				state.userId = action.payload.userId;
				state.username = action.payload.username;
				state.displayName = action.payload.displayName;
				state.bio = action.payload.bio;
				state.friends = action.payload.friends;
				state.bannerUrl = action.payload.bannerUrl;
				state.avatarUrl = action.payload.avatarUrl;
				state.createdAt = action.payload.createdAt;
				state.allowNSFW = action.payload.allowNSFW;
				state.allowAnyNotifications = action.payload.allowAnyNotifications;
				state.allowPublicChatNotifications = action.payload.allowPublicChatNotifications;
				state.allowPrivateChatNotifications = action.payload.allowPrivateChatNotifications;
			})
			.addCase(registerUser.rejected, (state) => {
				state.loggingIn = false;
				state.loggedIn = false;
				state.initialized = true;
			})
			.addCase(loginUser.pending, (state) => {
				state.loggingIn = true;
			})
			.addCase(loginUser.fulfilled, (state, action) => {
				state.loggingIn = false;
				state.loggedIn = true;
				state.skipAutoLogin = false;
				setAuthSessionPresent(true);
				setAutoLoginBlocked(false);
				state.initialized = true;
				state.authToken = action.payload.authToken;
				state.userId = action.payload.userId;
				state.username = action.payload.username;
				state.displayName = action.payload.displayName;
				state.bio = action.payload.bio;
				state.friends = action.payload.friends;
				state.bannerUrl = action.payload.bannerUrl;
				state.avatarUrl = action.payload.avatarUrl;
				state.createdAt = action.payload.createdAt;
				state.allowNSFW = action.payload.allowNSFW;
				state.allowAnyNotifications = action.payload.allowAnyNotifications;
				state.allowPublicChatNotifications = action.payload.allowPublicChatNotifications;
				state.allowPrivateChatNotifications = action.payload.allowPrivateChatNotifications;
			})
			.addCase(loginUser.rejected, (state) => {
				state.loggingIn = false;
				state.loggedIn = false;
				state.initialized = true;
			})
			.addCase(changePassword.pending, (state) => {
				state.passwordChanging = true;
				state.passwordChangeError = null;
			})
			.addCase(changePassword.fulfilled, (state) => {
				state.passwordChanging = false;
				state.passwordChangeError = null;
				applyLoggedOutState(state, true);
			})
			.addCase(changePassword.rejected, (state, action) => {
				state.passwordChanging = false;
				state.passwordChangeError = action.payload || "Failed to update password";
			})
			.addCase(logoutUser.fulfilled, (state, action) => {
				applyLoggedOutState(state, action.payload?.disableAutoLogin);
			})
			.addCase(logoutUser.rejected, (state, action) => {
				applyLoggedOutState(state, action.payload?.disableAutoLogin || action.meta?.arg?.disableAutoLogin);
			});
	},
});

export const { setAuthState, setLoggedIn, setLoggingIn } = authSlice.actions;

export default authSlice.reducer;
