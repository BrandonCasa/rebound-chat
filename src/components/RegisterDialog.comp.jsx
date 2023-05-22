import React, { useState, useRef, useEffect } from "react";
import { Dialog, Box, Typography, FormControl, InputLabel, Input, FormHelperText, TextField, DialogActions, Button } from "@mui/material";
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
  const loginDialogState = useSelector((state) => state.dialogs.registerDialogOpen);
  const dispatch = useDispatch();

  const [displayName, setdisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [usernameErrors, setUsernameErrors] = useState({
    undefined: false,
    spaces: false,
    short: false,
    long: false,
    case: false,
  });
  const [displayNameErrors, setDisplayNameErrors] = useState({
    undefined: false,
    spaces: false,
    short: false,
    long: false,
  });
  const [passwordErrors, setPasswordErrors] = useState({
    undefined: false,
    spaces: false,
    short: false,
    long: false,
  });
  const [regErrors, setRegErrors] = useState([]);

  async function handleUserRegister() {
    let requestString = "";
    if (!process.env.NODE_ENV || process.env.NODE_ENV === "development") {
      requestString = "http://localhost:6001/api/auth/register/";
    } else {
      requestString = "/api/auth/register/";
    }
    const response = await fetch(requestString, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Allow-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({
        displayName: displayName,
        username: username,
        password: password,
      }),
    });
    const res = await response;
    if (res.status === 200) {
      setRegErrors([]);
      const authtoken = await res.text();
      window.localStorage.setItem("auth-token", authtoken);
      dispatch(setAuthState({ authToken: authtoken }));
      dispatch(setLoggedIn({ loggedIn: true }));
      dispatch(setDialogOpened({ dialogName: "registerDialogOpen", newState: false }));
    } else if (res.status === 400) {
      const data = await response.json();
      let regErrors = [];
      data.errors.forEach((error) => {
        regErrors.push(error.msg);
      });
      setRegErrors(regErrors);
    }
  }

  return (
    <Dialog open={loginDialogState} onClose={() => dispatch(setDialogOpened({ dialogName: "registerDialogOpen", newState: false }))}>
      <Box
        sx={{
          maxWidth: "500px",
          justifyContent: "center",
          display: "flex",
          p: 3,
          flexDirection: "column",
          textAlign: "center",
        }}
        component="form"
      >
        <Typography variant="h4">Welcome to Rebound</Typography>
        <Typography variant="subtitle" sx={{ pb: 3 }}>
          Register to join a communication network like no other.
        </Typography>
        <TextField
          sx={{ pb: 3 }}
          label="Display Name"
          variant="outlined"
          value={displayName}
          onChange={(e) => {
            setRegErrors([]);
            let errors = { undefined: false, spaces: false, short: false, long: false };
            if (e.target.value.length === 0) {
              errors.undefined = true;
            } else {
              if (e.target.value.startsWith(" ") || e.target.value.endsWith(" ")) {
                errors.spaces = true;
              }
              if (e.target.value.length < 3) {
                errors.short = true;
              }
              if (e.target.value.length > 16) {
                errors.long = true;
              }
            }
            setDisplayNameErrors(errors);
            setdisplayName(e.target.value);
          }}
          helperText="Your public display name."
          autoComplete="current-displayName"
        />
        <TextField
          sx={{ pb: 3 }}
          label="Username"
          variant="outlined"
          value={username}
          onChange={(e) => {
            setRegErrors([]);
            let errors = { undefined: false, spaces: false, short: false, long: false, case: false };
            if (e.target.value.length === 0) {
              errors.undefined = true;
            } else {
              if (e.target.value.includes(" ")) {
                errors.spaces = true;
              }
              if (e.target.value.length < 3) {
                errors.short = true;
              }
              if (e.target.value.length > 24) {
                errors.long = true;
              }
              if (e.target.value.toLowerCase() !== e.target.value) {
                errors.case = true;
              }
            }
            setUsernameErrors(errors);
            setUsername(e.target.value);
          }}
          helperText="Your username will be visible to other users."
          autoComplete="current-username"
        />
        <TextField
          label="Password"
          variant="outlined"
          type="password"
          value={password}
          onChange={(e) => {
            setRegErrors([]);
            let errors = { undefined: false, spaces: false, short: false, long: false };
            if (e.target.value.length === 0) {
              errors.undefined = true;
            } else {
              if (e.target.value.includes(" ")) {
                errors.spaces = true;
              }
              if (e.target.value.length < 5) {
                errors.short = true;
              }
              if (e.target.value.length > 50) {
                errors.long = true;
              }
            }
            setPasswordErrors(errors);
            setPassword(e.target.value);
          }}
          helperText="We encrypt all passwords."
          autoComplete="current-password"
        />
        {displayNameErrors.spaces && !regErrors.includes("Display name must not start or end with spaces.") && (
          <Typography variant="subtitle" color="#c96800" fontWeight={900}>
            - Display name must not start or end with spaces.
          </Typography>
        )}
        {displayNameErrors.undefined && !regErrors.includes("Display name is required.") && (
          <Typography variant="subtitle" color="#c96800" fontWeight={900}>
            - Display name is required.
          </Typography>
        )}
        {displayNameErrors.short && !regErrors.includes("Display name must be at least 3 characters long.") && (
          <Typography variant="subtitle" color="#c96800" fontWeight={900}>
            - Display name must be at least 3 characters long.
          </Typography>
        )}
        {displayNameErrors.long && !regErrors.includes("Display name cannot be longer than 16 characters.") && (
          <Typography variant="subtitle" color="#c96800" fontWeight={900}>
            - Display name cannot be longer than 16 characters.
          </Typography>
        )}
        {usernameErrors.spaces && !regErrors.includes("Username must not contain spaces.") && (
          <Typography variant="subtitle" color="#c96800" fontWeight={900}>
            - Username must not contain spaces.
          </Typography>
        )}
        {usernameErrors.undefined && !regErrors.includes("Username is required.") && (
          <Typography variant="subtitle" color="#c96800" fontWeight={900}>
            - Username is required.
          </Typography>
        )}
        {usernameErrors.short && !regErrors.includes("Username must be at least 3 characters long.") && (
          <Typography variant="subtitle" color="#c96800" fontWeight={900}>
            - Username must be at least 3 characters long.
          </Typography>
        )}
        {usernameErrors.long && !regErrors.includes("Username cannot be longer than 24 characters.") && (
          <Typography variant="subtitle" color="#c96800" fontWeight={900}>
            - Username cannot be longer than 24 characters.
          </Typography>
        )}
        {usernameErrors.case && !regErrors.includes("Username must be lowercase.") && (
          <Typography variant="subtitle" color="#c96800" fontWeight={900}>
            - Username must be lowercase.
          </Typography>
        )}
        {passwordErrors.spaces && !regErrors.includes("Password must not contain spaces.") && (
          <Typography variant="subtitle" color="#c96800" fontWeight={900}>
            - Password must not contain spaces.
          </Typography>
        )}
        {passwordErrors.undefined && !regErrors.includes("Password is required.") && (
          <Typography variant="subtitle" color="#c96800" fontWeight={900}>
            - Password is required.
          </Typography>
        )}
        {passwordErrors.short && !regErrors.includes("Password must be at least 5 characters long.") && (
          <Typography variant="subtitle" color="#c96800" fontWeight={900}>
            - Password must be at least 5 characters long.
          </Typography>
        )}
        {passwordErrors.long && !regErrors.includes("Password cannot be longer than 50 characters.") && (
          <Typography variant="subtitle" color="#c96800" fontWeight={900}>
            - Password cannot be longer than 50 characters.
          </Typography>
        )}
        {regErrors.map((error) => (
          <Typography variant="subtitle" color="error" fontWeight={900}>
            - {error}
          </Typography>
        ))}
      </Box>
      <DialogActions>
        <Button
          variant="outlined"
          onClick={() => dispatch(setDialogOpened({ dialogName: "loginDialogOpen", newState: true, conflictingDialogs: ["registerDialogOpen"] }))}
        >
          Existing User
        </Button>
        <Button autoFocus variant="contained" onClick={handleUserRegister}>
          Register
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default LoginDialog;
