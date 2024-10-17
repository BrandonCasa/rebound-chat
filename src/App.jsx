import React, { useEffect, Suspense, lazy } from "react";
import { BrowserRouter as Router, Route, Routes } from "react-router-dom";
import { useSelector, useDispatch } from "react-redux";
import { CssBaseline, ThemeProvider } from "@mui/material";
import { createTheme } from "@mui/material/styles";
import { useSnackbar } from "@mui/base";
import { styled } from "@mui/material/styles";
import "./App.css";
import CustomAppBar from "./components/CustomAppBar/CustomAppBar";
import RegisterDialog from "./components/RegisterDialog";
import LoginDialog from "./components/LoginDialog.comp";
import socketIoHelper from "./helpers/socket";
import { setLoggedIn, setLoggingIn, setSocketStatus } from "./slices/authSlice";
import useDarkTheme from "./helpers/darkTheme";
import axios from "axios";

const LandingPage = lazy(() => import("./routes/LandingPage/LandingPage.route"));
const ProfilePage = lazy(() => import("routes/ProfilePage/ProfilePage.route"));
const ChatPage = lazy(() => import("routes/ChatPage/ChatPage"));
const ServersPage = lazy(() => import("routes/ServersPage/ServersPage.route"));

const PageNotFoundContainer = styled("div")({
	maxWidth: "100%",
	textAlign: "center",
});

const App = () => {
	const authState = useSelector((state) => state.auth);
	const darkTheme = useDarkTheme();
	const dispatch = useDispatch();
	const enqueueSnackbar = useSnackbar({ autoHideDuration: 2000 });

	const useSocketConnection = (authToken, loggedIn) => {
		useEffect(() => {
			const connectSocket = async (token) => {
				const socketClient = socketIoHelper.connectSocket(token);

				socketClient.on("connected", () => {
					dispatch(setSocketStatus({ connected: true }));
				});

				socketClient.on("disconnect", () => {
					dispatch(setSocketStatus({ connected: false }));
				});
			};

			if (!socketIoHelper.getSocket()?.connected && loggedIn) {
				connectSocket(authToken);
			}

			return () => {
				if (socketIoHelper.getSocket()?.connected) {
					socketIoHelper.disconnectSocket();
				}
			};
		}, [loggedIn, authToken]);
	};

	const useVerifyUser = (authState) => {
		useEffect(() => {
			const verifyUser = async () => {
				if (authState.authToken && !authState.loggedIn) {
					dispatch(setLoggingIn({ loggingIn: true }));
					const requestString = process.env.NODE_ENV === "development" ? `http://localhost:6001/api/users/verify` : `/api/users/verify`;

					try {
						const response = await axios.get(requestString, {
							headers: {
								"Content-Type": "application/json",
								"Allow-Control-Allow-Origin": "*",
								authorization: `Bearer ${authState.authToken}`,
							},
						});
						dispatch(
							setLoggedIn({
								loggedIn: true,
								userId: response.data.user.id,
								username: response.data.user.username,
								displayName: response.data.user.displayName,
								bio: response.data.user.bio,
								authToken: authState.authToken,
								friends: response.data.user.friends,
							})
						);
					} catch (error) {
						enqueueSnackbar("Failed to verify user. Please try logging in again.", { variant: "error" });
						window.localStorage.removeItem("auth-token");
						dispatch(setLoggedIn({ loggedIn: false, token: null }));
					}
				} else {
					dispatch(setLoggingIn({ loggingIn: false }));
				}
			};

			verifyUser();
		}, [authState.authToken, authState.loggedIn, dispatch]);
	};

	useSocketConnection(authState.authToken, authState.loggedIn);
	useVerifyUser(authState);

	return (
		<ThemeProvider theme={darkTheme}>
			<CssBaseline />
			<Snackbar open={open} autoHideDuration={5000} onClose={handleClose} message="This Snackbar will be dismissed in 5 seconds." />
			<Router>
				<RegisterDialog />
				<LoginDialog />
				<CustomAppBar>
					{!authState.loggingIn ? (
						<Suspense fallback={<div>Loading...</div>}>
							<Routes>
								<Route path="/" element={<LandingPage />} />
								<Route path="/profile" element={<ProfilePage />} />
								<Route path="/chat" element={<ChatPage />} />
								<Route path="/servers" element={<ServersPage />} />
								<Route
									path="*"
									element={
										<PageNotFoundContainer>
											PAGE NOT FOUND :(
											<br />
											<img style={{ maxWidth: "100%" }} src="./404.gif" alt="oops" />
										</PageNotFoundContainer>
									}
								/>
							</Routes>
						</Suspense>
					) : null}
				</CustomAppBar>
			</Router>
		</ThemeProvider>
	);
};

export default App;
