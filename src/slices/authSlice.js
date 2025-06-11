import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import axios from "axios";

import socketIoHelper from "../helpers/socket";
import { getApiBase } from "../helpers/api";

const initialState = {
	authToken: window.localStorage.getItem("auth-token"),
	friends: [],
	loggedIn: false,
	userId: null,
	username: "",
	displayName: "",
	bio: "",
	loggingIn: false,
	socketInfo: {
		connected: false,
		currentRoom: null,
	},
	bannerUrl: null,
	avatarUrl: null,
};

export const verifyUser = createAsyncThunk("auth/verifyUser", async (token, { rejectWithValue }) => {
	const base = getApiBase();
	try {
		const { data } = await axios.post(
			`${base}/users/verify`,
			{},
			{
				headers: {
					"Content-Type": "application/json",
					authorization: `Bearer ${token}`,
				},
			}
		);
		const u = data.user;
		return {
			loggedIn: true,
			authToken: token,
			userId: u.id,
			username: u.username,
			displayName: u.displayName,
			bio: u.bio,
			friends: u.friends,
			bannerUrl: u?.bannerUrl && u.bannerUrl !== "" ? base + u.bannerUrl : globalThis.IN_ELECTRON_ENV ? "banner.webp" : "/banner.webp",
			avatarUrl: u?.avatarUrl && u.avatarUrl !== "" ? base + u.avatarUrl : globalThis.IN_ELECTRON_ENV ? "defaultpfp.webp" : "/defaultpfp.webp",
		};
	} catch (err) {
		return rejectWithValue(err.response?.data || err.message);
	}
});

export const loginUser = createAsyncThunk("auth/loginUser", async ({ email, password }, { rejectWithValue }) => {
	const base = getApiBase();
	try {
		const { data } = await axios.post(`${base}/users/login`, {
			user: { email, password },
		});
		const u = data.user;
		return {
			loggedIn: true,
			authToken: u.token,
			userId: u.id,
			username: u.username,
			displayName: u.displayName,
			bio: u.bio,
			friends: u.friends,
			bannerUrl: u?.bannerUrl && u.bannerUrl !== "" ? base + u.bannerUrl : globalThis.IN_ELECTRON_ENV ? "banner.webp" : "/banner.webp",
			avatarUrl: u?.avatarUrl && u.avatarUrl !== "" ? base + u.avatarUrl : globalThis.IN_ELECTRON_ENV ? "defaultpfp.webp" : "/defaultpfp.webp",
		};
	} catch (err) {
		return rejectWithValue(err.response?.data || err.message);
	}
});

export const registerUser = createAsyncThunk(
	"auth/registerUser",
	async ({ username, email, displayName, bio, password, stayLoggedIn }, { rejectWithValue }) => {
		const base = getApiBase();
		try {
			const { data } = await axios.post(`${base}/users/register`, {
				user: { username, email, displayName, bio, password },
			});
			const u = data.user;
			if (stayLoggedIn) {
				window.localStorage.setItem("auth-token", u.token);
			}
			return {
				loggedIn: true,
				authToken: u.token,
				userId: u.id,
				username: u.username,
				displayName: u.displayName,
				bio: u.bio,
				friends: u.friends,
				bannerUrl: u?.bannerUrl && u.bannerUrl !== "" ? base + u.bannerUrl : globalThis.IN_ELECTRON_ENV ? "banner.webp" : "/banner.webp",
				avatarUrl: u?.avatarUrl && u.avatarUrl !== "" ? base + u.avatarUrl : globalThis.IN_ELECTRON_ENV ? "defaultpfp.webp" : "/defaultpfp.webp",
			};
		} catch (err) {
			return rejectWithValue(err.response?.data || err.message);
		}
	}
);

const authSlice = createSlice({
	name: "auth",
	initialState,
	reducers: {
		setAuthState: (state, action) => {
			if (action.payload.authToken !== undefined) {
				state.authToken = action.payload.authToken;
			}
		},
		setLoggedIn: (state, action) => {
			if ("loggedIn" in action.payload) {
				state.loggingIn = false;
				state.loggedIn = action.payload.loggedIn;

				if (action.payload.loggedIn === false) {
					action.payload.authToken = null;
					action.payload.userId = null;
					action.payload.username = "";
					action.payload.displayName = "";
					action.payload.bio = "";
					action.payload.friends = [];
					state.socketInfo.currentRoom = null;
					state.bannerUrl = null;
					state.avatarUrl = null;
				}
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
				state.authToken = action.payload.authToken;
				state.userId = action.payload.userId;
				state.username = action.payload.username;
				state.displayName = action.payload.displayName;
				state.bio = action.payload.bio;
				state.friends = action.payload.friends;
				state.bannerUrl = action.payload.bannerUrl;
				state.avatarUrl = action.payload.avatarUrl;
			})
			.addCase(verifyUser.rejected, (state) => {
				state.loggingIn = false;
				state.loggedIn = false;
			})
			.addCase(registerUser.pending, (state) => {
				state.loggingIn = true;
			})
			.addCase(registerUser.fulfilled, (state, action) => {
				state.loggingIn = false;
				state.loggedIn = true;
				state.authToken = action.payload.authToken;
				state.userId = action.payload.userId;
				state.username = action.payload.username;
				state.displayName = action.payload.displayName;
				state.bio = action.payload.bio;
				state.friends = action.payload.friends;
				state.bannerUrl = action.payload.bannerUrl;
				state.avatarUrl = action.payload.avatarUrl;
			})
			.addCase(registerUser.rejected, (state) => {
				state.loggingIn = false;
				state.loggedIn = false;
			})
			.addCase(loginUser.pending, (state) => {
				state.loggingIn = true;
			})
			.addCase(loginUser.fulfilled, (state, action) => {
				state.loggingIn = false;
				state.loggedIn = true;
				state.authToken = action.payload.authToken;
				state.userId = action.payload.userId;
				state.username = action.payload.username;
				state.displayName = action.payload.displayName;
				state.bio = action.payload.bio;
				state.friends = action.payload.friends;
				state.bannerUrl = action.payload.bannerUrl;
				state.avatarUrl = action.payload.avatarUrl;
				window.localStorage.setItem("auth-token", action.payload.authToken);
			})
			.addCase(loginUser.rejected, (state) => {
				state.loggingIn = false;
				state.loggedIn = false;
			});
	},
});

export const { setAuthState, setLoggedIn, setLoggingIn, setSocketStatus, setSocketRoom } = authSlice.actions;

export default authSlice.reducer;
