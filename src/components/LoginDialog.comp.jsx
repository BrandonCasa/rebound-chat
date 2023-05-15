import React, { useState, useRef, useEffect } from "react";
import { Dialog, Box, Typography, FormControl, InputLabel, Input, FormHelperText, TextField, DialogActions, Button } from "@mui/material";
import GoogleButton from "react-google-button";
import { useDispatch, useSelector } from "react-redux";
import { setDialogOpened } from "../reducers/dialogReducer";
import { AddCircleRounded, TagFacesRounded } from "@mui/icons-material";
import styled from "styled-components";
import { useTheme } from "@mui/material/styles";

const interestsList = [{ title: "Gaming" }, { title: "Sports" }, { title: "Anime" }, { title: "Streamers" }, { title: "Memes" }];

const formStyles = {
  maxWidth: "500px",
  justifyContent: "center",
  display: "flex",
  p: 3,
  flexDirection: "column",
  textAlign: "center",
};

const LoginDialog = () => {
  const theme = useTheme();
  const loginDialogState = useSelector((state) => state.dialogs.loginDialogOpen);
  const dispatch = useDispatch();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  return (
    <Dialog open={loginDialogState} onClose={() => dispatch(setDialogOpened({ dialogName: "loginDialogOpen", newState: false }))}>
      <Box sx={formStyles} component="form">
        <Typography variant="h4">Welcome to Rebound</Typography>
        <Typography variant="subtitle" sx={{ pb: 3 }}>
          Register to join a communication network like no other.
        </Typography>
        <TextField sx={{ pb: 3 }} label="Email" variant="outlined" value={email} onChange={(e) => setEmail(e.target.value)} helperText="We'll never share your email." autoComplete="current-email" />
        <TextField
          label="Password"
          variant="outlined"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          helperText="We encrypt all passwords."
          autoComplete="current-password"
        />
      </Box>
      <DialogActions>
        <Button variant="outlined">Existing User</Button>
        <Button autoFocus variant="contained">
          Register
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default LoginDialog;
