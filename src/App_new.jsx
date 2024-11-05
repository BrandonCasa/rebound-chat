import React, { useEffect, Suspense, lazy } from "react";
import { BrowserRouter as Router, Route, Routes } from "react-router-dom";
import { useSelector, useDispatch } from "react-redux";
import { Alert, CssBaseline, List, ListItem, ListSubheader, Snackbar, ThemeProvider } from "@mui/material";
import { createTheme } from "@mui/material/styles";
import { useSnackbar } from "@mui/base";
import { styled } from "@mui/material/styles";
import "./App.css";
import CustomAppBar from "./components/CustomAppBar/CustomAppBar";
import RegisterDialog from "./components/RegisterDialog";
import LoginDialog from "./components/LoginDialog.comp";
import socketIoHelper from "./helpers/socket";
import { setLoggedIn, setLoggingIn, setSocketStatus } from "./slices/authSlice";
import { addSnackbar, removeSnackbar } from "./slices/snackbarSlice";
import useDarkTheme from "./helpers/darkTheme";
import axios from "axios";
import SnackbarMapper from "./components/SnackbarMapper";
import useCustomAppBar from "components/CustomAppBar/useCustomAppBar";
import useWindowDimensions from "helpers/useWindowDimensions";
import StateDisplay from "components/Misc/StateDisplay";

const LandingPage = lazy(() => import("./routes/LandingPage/LandingPage.route"));
const ProfilePage = lazy(() => import("routes/ProfilePage/ProfilePage.route"));
const ChatPage = lazy(() => import("routes/ChatPage/ChatPage"));
const ServersPage = lazy(() => import("routes/ServersPage/ServersPage.route"));
const TestingPage = lazy(() => import("routes/TestingPage/TestingPage.route"));

const PageNotFoundContainer = styled("div")({
	maxWidth: "100%",
	textAlign: "center",
});

const AppNew = () => {
	const authStateNew = useSelector((state) => state.authNew);
	const darkTheme = useDarkTheme();
	const dispatch = useDispatch();
	const customAppBarProps = useCustomAppBar(useWindowDimensions().width);

	return (
		<ThemeProvider theme={darkTheme}>
			<CssBaseline />
			<SnackbarMapper drawerWidth={customAppBarProps.drawerWidth} drawerOpen={customAppBarProps.drawerOpen} />
			<Router>
				<RegisterDialog />
				<LoginDialog />
				<CustomAppBar {...customAppBarProps}>
					<StateDisplay stateIn={authStateNew} />
				</CustomAppBar>
			</Router>
		</ThemeProvider>
	);
};

export default AppNew;
