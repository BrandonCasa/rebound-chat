// slices/authSlice.js
import { createSlice } from "@reduxjs/toolkit";
import { authApi } from "services/authApi";
import socketIoHelper from "helpers/socket";

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
};

const authSlice = createSlice({
	name: "authNew",
	initialState,
	reducers: {
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
		logoutUser: (state) => {
			state.authToken = null;
			state.loggedIn = false;
			state.userId = null;
			state.username = "";
			state.displayName = "";
			state.bio = "";
			state.friends = [];
			state.socketInfo.currentRoom = null;
			window.localStorage.removeItem("auth-token");
		},
	},
	extraReducers: (builder) => {
		// Handle login
		builder.addMatcher(authApi.endpoints.loginUser.matchFulfilled, (state, { payload }) => {
			const { user } = payload;
			state.authToken = user.token;
			state.loggedIn = true;
			state.loggingIn = false;
			state.userId = user.id;
			state.username = user.username;
			state.displayName = user.displayName;
			state.bio = user.bio;
			state.friends = user.friends;
			window.localStorage.setItem("auth-token", user.token);
		});

		builder.addMatcher(authApi.endpoints.loginUser.matchPending, (state) => {
			state.loggingIn = true;
		});

		builder.addMatcher(authApi.endpoints.loginUser.matchRejected, (state) => {
			state.loggingIn = false;
		});

		// Handle user verification
		builder.addMatcher(authApi.endpoints.verifyUser.matchFulfilled, (state, { payload }) => {
			const { user } = payload;
			state.loggedIn = true;
			state.userId = user.id;
			state.username = user.username;
			state.displayName = user.displayName;
			state.bio = user.bio;
			state.friends = user.friends;
		});

		builder.addMatcher(authApi.endpoints.verifyUser.matchRejected, (state) => {
			state.loggedIn = false;
			state.authToken = null;
			window.localStorage.removeItem("auth-token");
		});

		// Handle user registration
		builder.addMatcher(authApi.endpoints.registerUser.matchFulfilled, (state, { payload }) => {
			const { user } = payload;
			state.authToken = user.token;
			state.loggedIn = true;
			state.userId = user.id;
			state.username = user.username;
			state.displayName = user.displayName;
			state.bio = user.bio;
			window.localStorage.setItem("auth-token", user.token);
		});

		// Handle profile modification
		builder.addMatcher(authApi.endpoints.modifyUser.matchFulfilled, (state, { payload }) => {
			const { user } = payload;
			state.username = user.username;
			state.displayName = user.displayName;
			state.bio = user.bio;
		});

		// Handle friend actions
		builder.addMatcher(authApi.endpoints.sendFriendRequest.matchFulfilled, (state, action) => {
			// Optionally handle updates after sending a friend request
		});

		builder.addMatcher(authApi.endpoints.acceptFriendRequest.matchFulfilled, (state, { payload }) => {
			const friend = payload.friend;
			state.friends = [...state.friends, friend]; // Add the new friend to the user's friends list
		});

		builder.addMatcher(authApi.endpoints.declineFriendRequest.matchFulfilled, (state, action) => {
			// Optionally handle updates after declining a friend request
		});

		builder.addMatcher(authApi.endpoints.cancelFriendRequest.matchFulfilled, (state, action) => {
			// Optionally handle updates after canceling a friend request
		});

		builder.addMatcher(authApi.endpoints.removeFriend.matchFulfilled, (state, { payload }) => {
			const friendId = payload.friendId;
			state.friends = state.friends.filter((friend) => friend.id !== friendId);
		});
	},
});

export const { setSocketStatus, setSocketRoom, logoutUser } = authSlice.actions;
export default authSlice.reducer;
