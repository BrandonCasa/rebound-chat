// hooks/useAuth.js
import { useSelector, useDispatch } from "react-redux";
import { useCallback } from "react";
import { setSocketStatus, setSocketRoom, logoutUser } from "slices/authSlice_new";
import { authApi } from "services/authApi";

const useAuth = () => {
	const dispatch = useDispatch();

	// Select relevant data from auth state
	const authToken = useSelector((state) => state.authNew.authToken);
	const loggedIn = useSelector((state) => state.authNew.loggedIn);
	const loggingIn = useSelector((state) => state.authNew.loggingIn);
	const userId = useSelector((state) => state.authNew.userId);
	const username = useSelector((state) => state.authNew.username);
	const displayName = useSelector((state) => state.authNew.displayName);
	const bio = useSelector((state) => state.authNew.bio);
	const friends = useSelector((state) => state.authNew.friends);
	const socketInfo = useSelector((state) => state.authNew.socketInfo);

	// Actions for managing socket connection
	const setSocketConnected = useCallback(
		(connected) => {
			dispatch(setSocketStatus({ connected }));
		},
		[dispatch]
	);

	const changeSocketRoom = useCallback(
		(currentRoom, lastRoom = null) => {
			dispatch(setSocketRoom({ currentRoom, lastRoom }));
		},
		[dispatch]
	);

	// Logout action
	const logout = useCallback(() => {
		dispatch(logoutUser());
	}, [dispatch]);

	// Login action example
	const login = useCallback(
		async (credentials) => {
			try {
				await dispatch(authApi.endpoints.loginUser.initiate(credentials)).unwrap();
			} catch (error) {
				console.error("Login failed:", error);
			}
		},
		[dispatch]
	);

	return {
		authToken,
		loggedIn,
		loggingIn,
		userId,
		username,
		displayName,
		bio,
		friends,
		socketInfo,
		setSocketConnected,
		changeSocketRoom,
		logout,
		login,
	};
};

export default useAuth;
