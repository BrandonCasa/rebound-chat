// services/authApi.js
import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";

const baseUrl = process.env.NODE_ENV === "development" ? "http://localhost:6001/api" : "/api";

// Create a custom baseQuery that includes authorization if token is available
const baseQuery = fetchBaseQuery({
	baseUrl,
	prepareHeaders: (headers, { getState }) => {
		const token = getState().auth.token;
		if (token) {
			headers.set("authorization", `Bearer ${token}`);
		}
		headers.set("Content-Type", "application/json");
		return headers;
	},
});

export const authApi = createApi({
	reducerPath: "authApi",
	baseQuery,
	endpoints: (builder) => ({
		// Verify user token
		verifyUser: builder.query({
			query: () => ({
				url: "/users/verify",
				method: "GET",
			}),
		}),

		// Login user
		loginUser: builder.mutation({
			query: (credentials) => ({
				url: "/users/login",
				method: "GET",
				body: credentials,
			}),
		}),

		// Register user
		registerUser: builder.mutation({
			query: (userData) => ({
				url: "/users/register",
				method: "POST",
				body: { user: userData },
			}),
		}),

		// Get user profile
		getUserProfile: builder.query({
			query: (userId) => ({
				url: `/users/profile?id=${userId}`,
				method: "GET",
			}),
		}),

		// Modify user information
		modifyUser: builder.mutation({
			query: (userUpdates) => ({
				url: "/users/modify",
				method: "PUT",
				body: { user: userUpdates },
			}),
		}),

		// Friend requests
		sendFriendRequest: builder.mutation({
			query: (recipientId) => ({
				url: "/users/addfriend",
				method: "PUT",
				body: { recipientId },
			}),
		}),
		acceptFriendRequest: builder.mutation({
			query: (friendId) => ({
				url: "/users/acceptfriend",
				method: "PUT",
				body: { friendId },
			}),
		}),
		declineFriendRequest: builder.mutation({
			query: (friendId) => ({
				url: "/users/declinefriend",
				method: "PUT",
				body: { friendId },
			}),
		}),
		cancelFriendRequest: builder.mutation({
			query: (friendId) => ({
				url: "/users/cancelfriend",
				method: "PUT",
				body: { friendId },
			}),
		}),
		removeFriend: builder.mutation({
			query: (friendId) => ({
				url: "/users/removefriend",
				method: "PUT",
				body: { friendId },
			}),
		}),
	}),
});

// Export hooks for components
export const {
	useVerifyUserQuery,
	useLoginUserMutation,
	useRegisterUserMutation,
	useGetUserProfileQuery,
	useModifyUserMutation,
	useSendFriendRequestMutation,
	useAcceptFriendRequestMutation,
	useDeclineFriendRequestMutation,
	useCancelFriendRequestMutation,
	useRemoveFriendMutation,
} = authApi;
