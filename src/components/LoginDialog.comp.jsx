import React, { useState } from "react";
import { Dialog, Box, Typography, TextField, DialogActions, Button, FormGroup, FormControlLabel, Checkbox } from "@mui/material";
import { useDispatch, useSelector } from "react-redux";
import { setDialogOpened } from "../reducers/dialogReducer";
import { setAuthState, setLoggedIn, setLoggingIn } from "../reducers/authReducer";
import axios from "axios";

const LoginDialog = () => {
  const loginDialogState = useSelector((state) => state.dialogs.loginDialogOpen);
  const dispatch = useDispatch();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [stayLoggedIn, setStayLoggedIn] = useState(true);

  const handleUserLogin = () => {
    const requestString = !process.env.NODE_ENV || process.env.NODE_ENV === "development" ? "http://localhost:6001/api/users/login" : "/api/users/login";
    axios
      .get(requestString, {
        params: {
          user: {
            email: email,
            password: password,
            //stayLoggedIn
          },
        },
      })
      .then((res) => {
        if (res.status === 200) {
          window.localStorage.setItem("auth-token", res.data.user.token);
          dispatch(
            setLoggedIn({
              loggedIn: true,
              id: res.data.user.id,
              username: res.data.user.username,
              displayName: res.data.user.displayName,
              bio: res.data.user.bio,
              authToken: res.data.user.token,
            })
          );
          dispatch(setDialogOpened({ dialogName: "loginDialogOpen", newState: false }));
        }
      })
      .catch((error) => {
        console.log(error.response.data.errors);
      });
  };

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
          label="Email"
          variant="outlined"
          value={email}
          type="email"
          onChange={(e) => {
            setEmail(e.target.value);
          }}
          autoComplete="current-email"
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
          <FormControlLabel control={<Checkbox defaultChecked />} label="Stay Logged In" onChange={(e) => setStayLoggedIn(e.target.checked)} value={stayLoggedIn} />
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
