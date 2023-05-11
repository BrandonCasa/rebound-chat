import logo from './logo.svg';
import './App.css';
import LandingPage from "./routes/LandingPage.route";
import { CssBaseline } from "@mui/material";
import { createTheme, ThemeProvider } from "@mui/material/styles";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import CustomAppBar from "./components/CustomAppBar.comp";
import darkTheme from "./helpers/darkTheme";
import LoginDialog from "./components/LoginDialog.comp";
import { useState } from "react";
import store from './store';
import { Provider } from "react-redux";

const router = createBrowserRouter([
  {
    path: "/",
    element: <LandingPage />,
  },
]);

function App() {
  return (
    <Provider store={store}>
      <ThemeProvider theme={darkTheme}>
        <CssBaseline />
        <LoginDialog />
        <CustomAppBar>
          <RouterProvider router={router} />
        </CustomAppBar>
      </ThemeProvider>
    </Provider>
  );
}

export default App;
