import "./App.css";
import LandingPage from "./routes/LandingPage/LandingPage.route";
import { CssBaseline } from "@mui/material";
import { createTheme, ThemeProvider } from "@mui/material/styles";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import CustomAppBar from "./components/CustomAppBar/CustomAppBar";
import darkTheme from "./helpers/darkTheme";
import RegisterDialog from "./components//RegisterDialog/index";
import LoginDialog from "./components/LoginDialog.comp";
import { useEffect, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";
import { setLoggedIn } from "./reducers/authReducer";
import axios from "axios";
import ProfilePage from "routes/ProfilePage.route";
import ChatPage from "routes/FriendHubPage/ChatPage";

function App() {
  const authTokenState = useSelector((state) => state.auth.authToken);
  const loggedInState = useSelector((state) => state.auth.loggedIn);
  const dispatch = useDispatch();

  useEffect(() => {
    if (authTokenState && authTokenState !== "" && !loggedInState) {
      // verify at /api/auth/verify
      const requestString = process.env.NODE_ENV === "development" ? "http://localhost:6001/api/auth/verify/" : "/api/auth/verify/";
      axios
        .get(requestString, {
          headers: {
            "Content-Type": "application/json",
            "Allow-Control-Allow-Origin": "*",
            Authorization: authTokenState,
          },
        })
        .then((response) => {
          dispatch(setLoggedIn({ loggedIn: true, username: response.data.user.username, displayName: response.data.user.displayName }));
        })
        .catch((error) => {
          console.log(error);
          window.localStorage.removeItem("auth-token");
        });
    }
  }, []);

  return (
    <ThemeProvider theme={darkTheme}>
      <CssBaseline />

      <BrowserRouter>
        <RegisterDialog />
        <LoginDialog />
        <CustomAppBar>
          <Routes>
            <Route exact path="/" element={<LandingPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/chat" element={<ChatPage />} />
            <Route path="*" element={<h1>404</h1>} />
          </Routes>
        </CustomAppBar>
      </BrowserRouter>
    </ThemeProvider>
  );
}

export default App;
