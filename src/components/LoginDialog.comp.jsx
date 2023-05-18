import React, { useState, useRef, useEffect } from "react";
import { Dialog, Box, Typography, FormControl, InputLabel, Input, FormHelperText, TextField, DialogActions, Button } from "@mui/material";
import GoogleButton from "react-google-button";
import { useDispatch, useSelector } from "react-redux";
import { setDialogOpened } from "../reducers/dialogReducer";
import { AddCircleRounded, TagFacesRounded } from "@mui/icons-material";
import styled from "styled-components";
import { useTheme } from "@mui/material/styles";

const interestsList = [{ title: "Gaming" }, { title: "Sports" }, { title: "Anime" }, { title: "Streamers" }, { title: "Memes" }];

const LoginDialog = () => {
  const theme = useTheme();
  const loginDialogState = useSelector((state) => state.dialogs.loginDialogOpen);
  const dispatch = useDispatch();

  const [displayname, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [errormsg, setErrormsg] = useState("");
  const [successmsg, setSuccessmsg] = useState("");

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
      },
      body: JSON.stringify({
        displayname: displayname,
        email: email,
        username: username,
        password: password,
      }),
    });
    const data = await response.json();
    console.log(data);
    if (data.hasOwnProperty("user")) {
      // dispatch(setDialogOpened({ dialogName: "loginDialogOpen", newState: false }));
      setSuccessmsg("User created successfully!");
    }
    if (data.hasOwnProperty("error")) {
      setErrormsg(data.error);
    }
  }

  return (
    <Dialog open={loginDialogState} onClose={() => dispatch(setDialogOpened({ dialogName: "loginDialogOpen", newState: false }))}>
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
          value={displayname}
          onChange={(e) => setDisplayName(e.target.value)}
          helperText="Your public display name."
          autoComplete="current-displayname"
        />
        <TextField
          sx={{ pb: 3 }}
          label="Email"
          variant="outlined"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          helperText="Your email will be private."
          autoComplete="current-email"
        />
        <TextField
          sx={{ pb: 3 }}
          label="Username"
          variant="outlined"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          helperText="Your username will be visible to other users."
          autoComplete="current-username"
        />
        <TextField
          label="Password"
          variant="outlined"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          helperText="We encrypt all passwords."
          autoComplete="current-password"
        />
        <Typography variant="subtitle" color="primary">
          {errormsg}
        </Typography>
        <Typography variant="subtitle" color="secondary">
          {successmsg}
        </Typography>
      </Box>
      <DialogActions>
        <Button variant="outlined">Existing User</Button>
        <Button autoFocus variant="contained" onClick={handleUserRegister}>
          Register
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default LoginDialog;
