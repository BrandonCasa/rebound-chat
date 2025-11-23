import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import axios from "axios";

import socketIoHelper from "../helpers/socket";
import {
        buildApiConfig,
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
        state.socketInfo.currentRoom = null;
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
	socketInfo: {
		connected: false,
		currentRoom: null,
	},
	bannerUrl: null,
	avatarUrl: null,
};

export const verifyUser = createAsyncThunk("auth/verifyUser", async (token, { getState, rejectWithValue }) => {
	const base = getApiBase();
	const authToken = token || getState().auth.authToken;
	try {
		const { data } = await axios.post(`${base}/users/verify`, {}, buildApiConfig(authToken, { headers: { "Content-Type": "application/json" } }));
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
		};
	} catch (err) {
		return rejectWithValue(err.response?.data || err.message);
	}
});

export const refreshAuthToken = createAsyncThunk("auth/refreshAuthToken", async (_, { rejectWithValue }) => {
	const base = getApiBase();
	try {
		const { data } = await axios.post(`${base}/users/refresh`, {}, buildApiConfig(null, { headers: { "Content-Type": "application/json" } }));

		setCsrfTokenCookie(data.csrfToken);
		setAuthSessionPresent(true);
		return { authToken: data.token };
	} catch (err) {
		return rejectWithValue(err.response?.data || err.message);
	}
});

export const bootstrapAuth = createAsyncThunk("auth/bootstrapAuth", async (_, { dispatch, rejectWithValue }) => {
        try {
                const hasSessionMarker =
                        typeof window !== "undefined" &&
                        (window.localStorage.getItem(AUTH_SESSION_MARKER) === "true" || hasAuthSessionCookie());

		if (!hasSessionMarker) {
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
			buildApiConfig(null, { headers: { "Content-Type": "application/json" } })
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
		};
	} catch (err) {
                return rejectWithValue(err.response?.data || err.message);
        }
});

export const logoutUser = createAsyncThunk(
        "auth/logoutUser",
        async ({ disableAutoLogin = false } = {}, { getState, rejectWithValue }) => {
                const base = getApiBase();
                const authToken = getState().auth.authToken;

                try {
                        await axios.delete(
                                `${base}/users/sessions`,
                                buildApiConfig(authToken, { params: { scope: "current" } })
                        );
                        clearAuthCookies();
                        setAuthSessionPresent(false);
                        return { disableAutoLogin };
                } catch (err) {
                        clearAuthCookies();
                        setAuthSessionPresent(false);
                        return rejectWithValue({ error: err.response?.data || err.message, disableAutoLogin });
                }
        }
);

export const registerUser = createAsyncThunk("auth/registerUser", async ({ username, email, displayName, bio, password }, { rejectWithValue }) => {
	const base = getApiBase();
	try {
		const { data } = await axios.post(
			`${base}/users/register`,
			{
				user: { username, email, displayName, bio, password },
			},
			buildApiConfig(null, { headers: { "Content-Type": "application/json" } })
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
		},
		setLoggingIn: (state, action) => {
			state.loggingIn = action.payload.loggingIn;
		},
		setSocketStatus: (state, action) => {
			state.socketInfo.connected = action.payload.connected;
		},
		setSocketRoom: (state, action) => {
			const socketClient = socketIoHelper.getSocket();

			const roomToLeave = action.payload.lastRoom || state.socketInfo.currentRoom;
			const roomToJoin = action.payload.currentRoom;

			if (!socketClient) {
				state.socketInfo.currentRoom = roomToJoin || null;
				return;
			}

			if (roomToLeave) {
				socketClient.emit("leave_room", roomToLeave);
				state.socketInfo.currentRoom = null;
			}

			if (roomToJoin) {
				socketClient.emit("join_room", roomToJoin);
				state.socketInfo.currentRoom = roomToJoin;
			}
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
                        })
                        .addCase(verifyUser.rejected, (state) => {
                                applyLoggedOutState(state);
                        })
                        .addCase(refreshAuthToken.pending, (state) => {
                                state.refreshing = true;
                                state.loggingIn = true;
                        })
                        .addCase(refreshAuthToken.fulfilled, (state, action) => {
                                state.refreshing = false;
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
                        })
                        .addCase(loginUser.rejected, (state) => {
                                state.loggingIn = false;
                                state.loggedIn = false;
                                state.initialized = true;
                        })
                        .addCase(logoutUser.fulfilled, (state, action) => {
                                applyLoggedOutState(state, action.payload?.disableAutoLogin);
                        })
                        .addCase(logoutUser.rejected, (state, action) => {
                                applyLoggedOutState(state, action.payload?.disableAutoLogin || action.meta?.arg?.disableAutoLogin);
                        });
        },
});

export const { setAuthState, setLoggedIn, setLoggingIn, setSocketStatus, setSocketRoom } = authSlice.actions;

export default authSlice.reducer;
