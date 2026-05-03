import { CssBaseline, ThemeProvider } from "@mui/material";
import { styled } from "@mui/material/styles";
import React, { useEffect, useRef, Suspense, lazy } from "react";
import { useSelector, useDispatch } from "react-redux";
import { BrowserRouter, HashRouter, Route, Routes } from "react-router-dom";

import "./App.css";

import CustomAppBar from "./components/CustomAppBar/CustomAppBar";
import LoginDialog from "./components/LoginDialog.comp";
import RegisterDialog from "./components/RegisterDialog";
import DraggableCallOverlay from "./components/CallOverlay/CallOverlay.comp";
import SnackbarMapper from "./components/SnackbarMapper";
import useDarkTheme from "./helpers/darkTheme";
import { bootstrapAuth, refreshAuthToken, setAuthState, verifyUser } from "./slices/authSlice";
import { connectSocket, disconnectSocket } from "./slices/socketSlice";
import { hasAuthSessionCookie } from "./helpers/api";
import { getTokenExpiry } from "./helpers/authToken";

import useCustomAppBar from "./components/CustomAppBar/useCustomAppBar";
import useWindowDimensions from "./helpers/useWindowDimensions";
import AutoUpdate from "./components/AutoUpdate";

const LandingPage = lazy(() => import("./routes/LandingPage/LandingPage.route"));
const ProfilePage = lazy(() => import("./routes/ProfilePage/ProfilePage.route"));
const ChatPage = lazy(() => import("./routes/ChatPage/ChatPage"));
const ServersPage = lazy(() => import("./routes/ServersPage/ServersPage.route"));
const TestingPage = lazy(() => import("./routes/TestingPage/TestingPage.route"));
const SecurityPage = lazy(() => import("./routes/SecurityPage/SecurityPage.route"));
const SettingsPage = lazy(() => import("./routes/SettingsPage/SettingsPage.route"));
const FriendPage = lazy(() => import("./routes/FriendPage/FriendPage.route"));
const DirectMessagePage = lazy(() => import("./routes/DirectMessagePage/DirectMessagePage"));
const LiveSharePage = lazy(() => import("./routes/LiveSharePage/LiveSharePage.route"));
const AvailableStreamsPage = lazy(() => import("./routes/AvailableStreamsPage/AvailableStreamsPage.route"));
const DesktopLivePage = lazy(() => import("./routes/DesktopLivePage/DesktopLivePage.route"));

const PageNotFoundContainer = styled("div")({
	maxWidth: "100%",
	textAlign: "center",
});

const AppRouter = ({ children }) => {
	const Router = window?.isElectron ? HashRouter : BrowserRouter;
	return <Router>{children}</Router>;
};

const App = () => {
	const authState = useSelector((state) => state.auth);
	const darkTheme = useDarkTheme();
	const dispatch = useDispatch();
	const customAppBarProps = useCustomAppBar(useWindowDimensions().width);
	const refreshTimeoutRef = useRef(null);

	useEffect(() => {
		const params = new URLSearchParams(window.location.search);
		const token = params.get("token");
		const authComplete = params.get("authComplete");
		if (token) {
			dispatch(setAuthState({ authToken: token }));
			dispatch(verifyUser(token));
			params.delete("token");
		}
		if (authComplete === "google") {
			dispatch(bootstrapAuth());
			params.delete("authComplete");
		}
		if (token || authComplete) {
			const newSearch = params.toString();
			const newUrl = window.location.pathname + (newSearch ? "?" + newSearch : "") + window.location.hash;
			window.history.replaceState({}, "", newUrl);
		}
	}, [dispatch]);

	useEffect(() => {
		if (authState.initialized || authState.authToken) return;

		const hasSessionMarker = hasAuthSessionCookie();
		if (!authState.skipAutoLogin || hasSessionMarker) {
			dispatch(bootstrapAuth());
		}
	}, [authState.initialized, authState.skipAutoLogin, authState.authToken, dispatch]);

	useEffect(() => {
		if (refreshTimeoutRef.current) {
			clearTimeout(refreshTimeoutRef.current);
			refreshTimeoutRef.current = null;
		}

		if (!authState.authToken) return undefined;

		const REFRESH_BUFFER_MS = 60_000;
		const MIN_REFRESH_DELAY_MS = 5_000;

		const scheduleRefresh = (delayMs) => {
			refreshTimeoutRef.current = window.setTimeout(() => {
				dispatch(refreshAuthToken());
			}, delayMs);
		};

		const tokenExpiry = getTokenExpiry(authState.authToken);

		if (!tokenExpiry) {
			scheduleRefresh(MIN_REFRESH_DELAY_MS);
			return undefined;
		}

		const refreshIn = tokenExpiry - Date.now() - REFRESH_BUFFER_MS;

		if (refreshIn <= 0) {
			dispatch(refreshAuthToken());
			return undefined;
		}

		scheduleRefresh(Math.max(refreshIn, MIN_REFRESH_DELAY_MS));
		//scheduleRefresh(10_000);

		return () => {
			if (refreshTimeoutRef.current) {
				clearTimeout(refreshTimeoutRef.current);
				refreshTimeoutRef.current = null;
			}
		};
	}, [authState.authToken, dispatch]);

	useEffect(() => {
		if (authState.loggedIn && authState.authToken) {
			dispatch(connectSocket());
		} else {
			dispatch(disconnectSocket());
		}
	}, [authState.loggedIn, authState.authToken, dispatch]);

	useEffect(() => {
		async function fetchFfmpegPath() {
			let ffmpegPath = undefined;

			ffmpegPath = await window.electronAPI.system.getFfmpegPath();
			ffmpegPath = ffmpegPath.replace("app.asar", "app.asar.unpacked");
			ffmpegPath = ffmpegPath.replace("app.asar.unpacked.unpacked", "app.asar.unpacked");

			window.ffmpegPath = ffmpegPath;
		}
		if (window.isElectron && !window.ffmpegPath) {
			fetchFfmpegPath();
		}
	}, []);

	const showAutoUpdate = window.isElectron;

	return (
		<ThemeProvider theme={darkTheme}>
			{showAutoUpdate && <AutoUpdate />}
			<CssBaseline />
			<SnackbarMapper drawerWidth={customAppBarProps.drawerWidth} drawerOpen={customAppBarProps.drawerOpen} />
			<AppRouter>
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
								<Route path="/live" element={<AvailableStreamsPage />} />
								<Route path="/live/streams" element={<AvailableStreamsPage />} />
								<Route path="/live/broadcast" element={<DesktopLivePage />} />
								<Route path="/live/share/:publicToken" element={<LiveSharePage />} />
								<Route path="/testing" element={<TestingPage />} />
								<Route path="/security" element={<SecurityPage />} />
								<Route path="/settings" element={<SettingsPage />} />
								<Route path="*" element={<PageNotFoundContainer>PAGE NOT FOUND</PageNotFoundContainer>} />
							</Routes>
						</Suspense>
					) : null}
				</CustomAppBar>
				<RegisterDialog />
				<LoginDialog />
				{/** <DraggableCallOverlay /> **/ <></>}
			</AppRouter>
		</ThemeProvider>
	);
};

export default App;
