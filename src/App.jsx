import React, { useEffect } from "react";
import { BrowserRouter as Router, Route, Routes } from "react-router-dom";
import { useSelector, useDispatch } from "react-redux";
import axios from "axios";
import { CssBaseline, ThemeProvider } from "@mui/material";
import { createTheme } from "@mui/material/styles";

import "./App.css";
import LandingPage from "./routes/LandingPage/LandingPage.route";
import ProfilePage from "routes/ProfilePage/ProfilePage.route";
import ChatPage from "routes/ChatPage/ChatPage";
import HubPage from "routes/HubPage/HubPage";
import CustomAppBar from "./components/CustomAppBar/CustomAppBar";
import RegisterDialog from "./components/RegisterDialog";
import LoginDialog from "./components/LoginDialog.comp";
import useDarkTheme from "./helpers/darkTheme";
import socketIoHelper from "./helpers/socket";
import { setLoggedIn, setLoggingIn, setSocketStatus } from "./slices/authSlice";

const App = () => {
  const authState = useSelector((state) => state.auth);
  const darkTheme = useDarkTheme();
  const dispatch = useDispatch();

  const connectSocket = async (token, onConnected, onDisconnected) => {
    const socketClient = socketIoHelper.connectSocket(token);

    socketClient.on("connected", () => {
      onConnected(socketClient);
      socketClient.off("connected");
      dispatch(setSocketStatus({ connected: true }));
    });

    socketClient.on("disconnect", () => {
      onDisconnected(socketClient);
      socketClient.off("disconnect");
      dispatch(setSocketStatus({ connected: false }));
    });
  };

  useEffect(() => {
    if (!socketIoHelper.getSocket()?.connected && authState.loggedIn) {
      connectSocket(
        authState.authToken,
        () => {},
        () => {}
      );
    }

    return () => {
      if (socketIoHelper.getSocket()?.connected) {
        socketIoHelper.disconnectSocket();
      }
    };
  }, [authState.loggedIn, authState.authToken]);

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
          console.log(error);
          window.localStorage.removeItem("auth-token");
          dispatch(setLoggedIn({ loggedIn: false, token: null }));
        }
      } else {
        dispatch(setLoggingIn({ loggingIn: false }));
      }
    };

    verifyUser();
  }, [authState.authToken, authState.loggedIn, dispatch]);

  return (
    <ThemeProvider theme={darkTheme}>
      <CssBaseline />
      <Router>
        <RegisterDialog />
        <LoginDialog />
        <CustomAppBar>
          {!authState.loggingIn && (
            <Routes>
              <Route path="/" element={<LandingPage />} />
              <Route path="/profile" element={<ProfilePage />} />
              <Route path="/chat" element={<ChatPage />} />
              <Route path="/test" element={<h1>{String(authState.loggingIn)}</h1>} />
              <Route
                path="*"
                element={
                  <div style={{ maxWidth: "100%" }}>
                    PAGE NOT FOUND :(
                    <br />
                    <img style={{ maxWidth: "100%" }} src="./404.gif" alt="oops" />
                  </div>
                }
              />
            </Routes>
          )}
        </CustomAppBar>
      </Router>
    </ThemeProvider>
  );
};

export default App;
