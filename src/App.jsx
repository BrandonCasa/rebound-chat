import { CssBaseline, ThemeProvider } from "@mui/material";
import { styled } from "@mui/material/styles";
import React, { useEffect, Suspense, lazy } from "react";
import { useSelector, useDispatch } from "react-redux";
import { BrowserRouter, HashRouter, Route, Routes } from "react-router-dom";

import "./App.css";

import CustomAppBar from "./components/CustomAppBar/CustomAppBar";
import LoginDialog from "./components/LoginDialog.comp";
import RegisterDialog from "./components/RegisterDialog";
import SnackbarMapper from "./components/SnackbarMapper";
import useDarkTheme from "./helpers/darkTheme";
import socketIoHelper from "./helpers/socket";
import { setLoggedIn, setLoggingIn, setSocketStatus, verifyUser } from "./slices/authSlice";
import { addSnackbar } from "./slices/snackbarSlice";

import useCustomAppBar from "./components/CustomAppBar/useCustomAppBar";
import useWindowDimensions from "./helpers/useWindowDimensions";
import AutoUpdate from "./components/AutoUpdate";

const LandingPage = lazy(() => import("./routes/LandingPage/LandingPage.route"));
const ProfilePage = lazy(() => import("./routes/ProfilePage/ProfilePage.route"));
const ChatPage = lazy(() => import("./routes/ChatPage/ChatPage"));
const ServersPage = lazy(() => import("./routes/ServersPage/ServersPage.route"));
const TestingPage = lazy(() => import("./routes/TestingPage/TestingPage.route"));
const SettingsPage = lazy(() => import("./routes/SettingsPage/SettingsPage.route"));
const FriendPage = lazy(() => import("./routes/FriendPage/FriendPage.route"));
const DirectMessagePage = lazy(() => import("./routes/DirectMessagePage/DirectMessagePage"));

const PageNotFoundContainer = styled("div")({
	maxWidth: "100%",
	textAlign: "center",
});

const AppRouter = ({ children }) => {
	const Router = window.isElectron ? HashRouter : BrowserRouter;
	return <Router>{children}</Router>;
};

const App = () => {
	const authState = useSelector((state) => state.auth);
	const darkTheme = useDarkTheme();
	const dispatch = useDispatch();
	const customAppBarProps = useCustomAppBar(useWindowDimensions().width);

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
			if (authState.authToken && !authState.loggedIn) {
				dispatch(setLoggingIn({ loggingIn: true }));
				dispatch(verifyUser(authState.authToken))
					.unwrap()
					.then((user) => {
						dispatch(
							addSnackbar({
								snackbarMsg: `Hello ${user.displayName}!`,
								snackbarSeverity: "success",
								autoHideDuration: 1000,
							})
						);
					})
					.catch(() => {
						dispatch(
							addSnackbar({
								snackbarMsg: "Failed to verify user. Please try logging in again.",
								snackbarSeverity: "error",
								autoHideDuration: 5000,
							})
						);
						window.localStorage.removeItem("auth-token");
						dispatch(setLoggedIn({ loggedIn: false, token: null }));
					});
			}
		}, [authState.authToken, authState.loggedIn, dispatch]);
	};

	useSocketConnection(authState.authToken, authState.loggedIn);
	useVerifyUser(authState);

	return (
		<ThemeProvider theme={darkTheme}>
			{window.isElectron && <AutoUpdate />}
			<CssBaseline />
			<SnackbarMapper drawerWidth={customAppBarProps.drawerWidth} drawerOpen={customAppBarProps.drawerOpen} />
			<AppRouter>
				<RegisterDialog />
				<LoginDialog />
				<CustomAppBar {...customAppBarProps}>
					{!authState.loggingIn ? (
						<Suspense fallback={<div>Loading...</div>}>
							<Routes>
								<Route path="/" element={<LandingPage />} />
								<Route path="/friends" element={<FriendPage />} />
								<Route path="/profile" element={<ProfilePage />} />
                                                                <Route path="/chat" element={<ChatPage />} />
                                                                <Route path="/dm/:userId" element={<DirectMessagePage />} />
								<Route path="/servers" element={<ServersPage />} />
								<Route path="/testing" element={<TestingPage />} />
								<Route path="/settings" element={<SettingsPage />} />
								<Route path="*" element={<PageNotFoundContainer>PAGE NOT FOUND</PageNotFoundContainer>} />
							</Routes>
						</Suspense>
					) : null}
				</CustomAppBar>
			</AppRouter>
		</ThemeProvider>
	);
};

export default App;
