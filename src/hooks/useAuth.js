// hooks/useAuth.js
import { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useVerifyUserQuery, useLoginUserMutation } from "../services/authApi";
import { setLoggingIn, logoutUser } from "slices/authSlice_new";
import { addSnackbar } from "slices/snackbarSlice";

const useAuth = () => {
	const dispatch = useDispatch();
	const authState = useSelector((state) => state.authNew);

	// Login mutation from authApi
	const [loginUser, { isLoading: isLoggingIn }] = useLoginUserMutation();

	// Verify query from authApi
	const {
		data: verifyData,
		error: verifyError,
		isFetching: isVerifying,
	} = useVerifyUserQuery(authState.authToken, {
		skip: !authState.authToken || authState.loggedIn,
	});

	// Effect to handle user verification response
	useEffect(() => {
		if (isVerifying) {
			dispatch(setLoggingIn({ loggingIn: true }));
		} else if (verifyData) {
			dispatch(
				addSnackbar({
					snackbarMsg: `Login reload successful. Hello ${verifyData.user.displayName}`,
					snackbarSeverity: "success",
					autoHideDuration: 2000,
				})
			);
		} else if (verifyError) {
			dispatch(
				addSnackbar({
					snackbarMsg: "Failed to verify user. Please try logging in again.",
					snackbarSeverity: "error",
					autoHideDuration: 5000,
				})
			);
			dispatch(logoutUser());
		}
	}, [verifyData, verifyError, isVerifying, dispatch]);

	// Login function
	const login = async (credentials) => {
		try {
			const { data } = await loginUser(credentials);
			dispatch(
				addSnackbar({
					snackbarMsg: `Login successful. Hello ${data.user.displayName}`,
					snackbarSeverity: "success",
					autoHideDuration: 2000,
				})
			);
		} catch (error) {
			dispatch(
				addSnackbar({
					snackbarMsg: "Login failed. Please check your credentials.",
					snackbarSeverity: "error",
					autoHideDuration: 5000,
				})
			);
		}
	};

	// Logout function
	const logout = () => {
		dispatch(logoutUser());
		dispatch(
			addSnackbar({
				snackbarMsg: "You have been logged out.",
				snackbarSeverity: "info",
				autoHideDuration: 2000,
			})
		);
	};

	return {
		login,
		logout,
		isLoggingIn,
		isVerifying,
		loggedIn: authState.loggedIn,
		user: {
			id: authState.userId,
			username: authState.username,
			displayName: authState.displayName,
			bio: authState.bio,
			friends: authState.friends,
		},
	};
};

export default useAuth;
