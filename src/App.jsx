import "./App.css";
import LandingPage from "./routes/LandingPage/LandingPage.route";
import { CssBaseline } from "@mui/material";
import { createTheme, ThemeProvider } from "@mui/material/styles";
import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";
import CustomAppBar from "./components/CustomAppBar/CustomAppBar";
import darkTheme from "./helpers/darkTheme";
import RegisterDialog from "./components//RegisterDialog/index";
import LoginDialog from "./components/LoginDialog.comp";
import { useEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { setLoggedIn, setLoggingIn, setSocketStatus } from "./reducers/authReducer";
import axios from "axios";
import ProfilePage from "routes/ProfilePage/ProfilePage";
import ChatPage from "routes/FriendHubPage/ChatPage";
import HubPage from "routes/FriendHubPage/HubPage";
import socketIoHelper from "./helpers/socket";

function App() {
  const authState = useSelector((state) => state.auth);
  const dispatch = useDispatch();

  const connectSocket = (token) => {
    let socketClient = socketIoHelper.connectSocket(token);

    socketClient.on("connected", () => {
      socketClient.off("connected");
      dispatch(setSocketStatus({ connected: true }));
    });

    socketClient.on("disconnect", () => {
      socketClient.off("disconnect");
      dispatch(setSocketStatus({ connected: false }));
    });
  };

  useEffect(() => {
    if (socketIoHelper.getSocket() === null || !socketIoHelper.getSocket().connected) {
      if (authState.loggedIn === true) {
        connectSocket(authState.authToken);
      } else {
        // Fix when anonymous temporary users are implemented
      }
    }

    return () => {
      if (socketIoHelper.getSocket() !== null && socketIoHelper.getSocket().connected) {
        socketIoHelper.disconnectSocket();
      }
    };
  }, [authState.loggedIn, authState.authToken]);

  useEffect(() => {
    if (authState.authToken && authState.authToken !== "" && !authState.loggedIn) {
      dispatch(setLoggingIn({ loggedIn: true }));

      const requestString = process.env.NODE_ENV === "development" ? "http://localhost:6001/api/users/verify" : "/api/users/verify";
      axios
        .get(requestString, {
          headers: {
            "Content-Type": "application/json",
            "Allow-Control-Allow-Origin": "*",
            authorization: `Bearer ${authState.authToken}`,
          },
        })
        .then((response) => {
          dispatch(setLoggedIn({ loggedIn: true, id: response.data.user.id, username: response.data.user.username, displayName: response.data.user.displayName }));
        })
        .catch((error) => {
          console.log(error);
          window.localStorage.removeItem("auth-token");
          dispatch(setLoggedIn({ loggedIn: false, token: null }));
        });
    } else {
      dispatch(setLoggingIn({ loggingIn: false }));
    }
  }, []);

  return (
    <ThemeProvider theme={darkTheme}>
      <CssBaseline />

      <BrowserRouter>
        <RegisterDialog />
        <LoginDialog />
        <CustomAppBar>
          {!authState.loggingIn && (
            <Routes>
              <Route exact path="/" element={<LandingPage />} />
              <Route path="/profile" element={<ProfilePage />} />
              <Route path="/chat" element={<ChatPage />} />
              {false && <Route path="/hub" element={<HubPage />} />}
              <Route path="/test" element={<h1>{authState.loggingIn?.toString()}</h1>} />
              <Route path="*" element={<h1>404</h1>} />
            </Routes>
          )}
        </CustomAppBar>
      </BrowserRouter>
    </ThemeProvider>
  );
}

export default App;
// <Route path="/chat" element={<ChatPage />} />
