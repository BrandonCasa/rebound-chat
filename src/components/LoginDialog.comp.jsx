import React, { useState, useRef, useEffect } from "react";
import {
  Dialog,
  Box,
  Typography,
  FormControl,
  InputLabel,
  Input,
  FormHelperText,
  TextField,
  DialogActions,
  Button,
  FormGroup,
  FormControlLabel,
  Checkbox,
} from "@mui/material";
import GoogleButton from "react-google-button";
import { useDispatch, useSelector } from "react-redux";
import { setDialogOpened } from "../reducers/dialogReducer";
import { AddCircleRounded, TagFacesRounded } from "@mui/icons-material";
import styled from "styled-components";
import { useTheme } from "@mui/material/styles";
import { setAuthState, setLoggedIn } from "../reducers/authReducer";

const interestsList = [{ title: "Gaming" }, { title: "Sports" }, { title: "Anime" }, { title: "Streamers" }, { title: "Memes" }];

const LoginDialog = () => {
  const theme = useTheme();
  const loginDialogState = useSelector((state) => state.dialogs.loginDialogOpen);
  const dispatch = useDispatch();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [stayLoggedIn, setStayLoggedIn] = useState(true);

  function inputStayLoggedIn(event) {
    setStayLoggedIn(event.target.checked);
  }

  async function handleUserLogin() {
    let requestString = "";
    if (!process.env.NODE_ENV || process.env.NODE_ENV === "development") {
      requestString = "http://localhost:6001/api/auth/login/";
    } else {
      requestString = "/api/auth/login/";
    }
    const response = await fetch(requestString, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Allow-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({
        username: username,
        password: password,
        stayLoggedIn: stayLoggedIn,
      }),
    });
    const res = await response;
    console.log(res);
    if (res.status === 400) {
    } else if (res.status === 500) {
    } else if (res.status === 200) {
      const authtoken = await res.text();
      window.localStorage.setItem("auth-token", authtoken);
      dispatch(setAuthState({ authToken: authtoken }));
      dispatch(setLoggedIn({ loggedIn: true }));
      dispatch(setDialogOpened({ dialogName: "loginDialogOpen", newState: false }));
    }
  }

  return (
    <Dialog open={loginDialogState} onClose={() => dispatch(setDialogOpened({ dialogName: "loginDialogOpen", newState: false }))}>
      <Box
        sx={{
          maxWidth: "500px",
          justifyContent: "center",
          display: "flex",
          p: 2,
          flexDirection: "column",
          textAlign: "center",
        }}
        component="form"
      >
        <Typography variant="h4">Welcome Back</Typography>
        <Typography variant="subtitle" sx={{ pb: 2 }}>
          Login to your existing Rebound account.
        </Typography>
        <TextField
          sx={{ pb: 2 }}
          label="Username"
          variant="outlined"
          value={username}
          onChange={(e) => {
            setUsername(e.target.value);
          }}
          autoComplete="current-username"
        />
        <TextField
          label="Password"
          variant="outlined"
          type="password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
          }}
          autoComplete="current-password"
        />
        <FormGroup>
          <FormControlLabel control={<Checkbox defaultChecked />} label="Stay Logged In" onChange={inputStayLoggedIn} value={stayLoggedIn} />
        </FormGroup>
      </Box>
      <DialogActions>
        <Button
          variant="outlined"
          onClick={() => dispatch(setDialogOpened({ dialogName: "registerDialogOpen", newState: true, conflictingDialogs: ["loginDialogOpen"] }))}
        >
          Make Account
        </Button>
        <Button autoFocus variant="contained" onClick={handleUserLogin}>
          Login
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default LoginDialog;
