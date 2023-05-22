import logo from './logo.svg';
import './App.css';
import LandingPage from "./routes/LandingPage.route";
import { CssBaseline } from "@mui/material";
import { createTheme, ThemeProvider } from "@mui/material/styles";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import CustomAppBar from "./components/CustomAppBar.comp";
import darkTheme from "./helpers/darkTheme";
import RegisterDialog from "./components/RegisterDialog.comp";
import LoginDialog from "./components/LoginDialog.comp";
import { useEffect, useState } from "react";
import { Provider, useDispatch, useSelector } from "react-redux";
import { setLoggedIn } from "./reducers/authReducer";

const router = createBrowserRouter([
  {
    path: "/",
    element: <LandingPage />,
  },
]);

function App() {
  const authTokenState = useSelector((state) => state.auth.authToken);
  const dispatch = useDispatch();

  useEffect(() => {
    if (authTokenState !== null && authTokenState !== undefined) {
      // verify at /api/auth/verify
      let requestString = "";
      if (!process.env.NODE_ENV || process.env.NODE_ENV === "development") {
        requestString = "http://localhost:6001/api/auth/verify/";
      } else {
        requestString = "/api/auth/verify/";
      }
      (async () => {
        const response = await fetch(requestString, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            "Allow-Control-Allow-Origin": "*",
            "Authorization": authTokenState,
          },
        });
        const res = await response;
        if (res.status !== 200) {
          // invalid token
          console.log(res);
          window.localStorage.removeItem("auth-token");
        } else {
          // valid token
          dispatch(setLoggedIn({ loggedIn: true }));
        }
      })();
    }
  }, []);

  return (
    <ThemeProvider theme={darkTheme}>
      <CssBaseline />
      <RegisterDialog />
      <LoginDialog />
      <CustomAppBar>
        <RouterProvider router={router} />
      </CustomAppBar>
    </ThemeProvider>
  );
}

export default App;
