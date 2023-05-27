import React, { useState } from "react";
import { 
  Dialog, Box, Typography, TextField, DialogActions, Button, FormGroup, FormControlLabel, Checkbox 
} from "@mui/material";
import { useDispatch, useSelector } from "react-redux";
import { setDialogOpened } from "../reducers/dialogReducer";
import { useTheme } from "@mui/material/styles";
import { setAuthState, setLoggedIn } from "../reducers/authReducer";
import axios from 'axios';

const RegisterDialog = () => {
  const dispatch = useDispatch();
  const registerDialogState = useSelector((state) => state.dialogs.registerDialogOpen);

  const [formData, setFormData] = useState({
    displayName: "",
    username: "",
    password: "",
    stayLoggedIn: true,
    displayNameErrors: {},
    usernameErrors: {},
    passwordErrors: {},
    regErrors: []
  });

  const handleFormDataChange = (field, value, errors = {}) => {
    setFormData({
      ...formData,
      [field]: value,
      [`${field}Errors`]: errors
    });
  };

  const handleStayLoggedInChange = (event) => {
    setFormData({ ...formData, stayLoggedIn: event.target.checked });
  };

  const handleUserRegister = async () => {
    let requestString = "";
    if (!process.env.NODE_ENV || process.env.NODE_ENV === "development") {
      requestString = "http://localhost:6001/api/auth/register/";
    } else {
      requestString = "/api/auth/register/";
    }
  
    try {
      const response = await axios.post(requestString, {
        displayName: formData.displayName,
        username: formData.username,
        password: formData.password,
        stayLoggedIn: formData.stayLoggedIn,
      });
  
      if (response.status === 200) {
        const authToken = response.data;
        window.localStorage.setItem("auth-token", authToken);
        dispatch(setAuthState({ authToken }));
        dispatch(setLoggedIn({ loggedIn: true }));
        dispatch(setDialogOpened({ dialogName: "registerDialogOpen", newState: false }));
        setFormData({...formData, regErrors: []})
      }
    } catch (error) {
      if (error.response && error.response.status === 400) {
        let regErrors = error.response.data.errors.map(error => error.msg);
        setFormData({...formData, regErrors})
      }
    }
  };

  const errorMessages = [
    formData.displayNameErrors.spaces && "Display name must not start or end with spaces.",
    formData.displayNameErrors.undefined && "Display name is required.",
    formData.displayNameErrors.short && "Display name must be at least 3 characters long.",
    formData.displayNameErrors.long && "Display name cannot be longer than 16 characters.",
    formData.usernameErrors.spaces && "Username must not contain spaces.",
    formData.usernameErrors.undefined && "Username is required.",
    formData.usernameErrors.short && "Username must be at least 3 characters long.",
    formData.usernameErrors.long && "Username cannot be longer than 24 characters.",
    formData.usernameErrors.case && "Username must be lowercase.",
    formData.passwordErrors.spaces && "Password must not contain spaces.",
    formData.passwordErrors.undefined && "Password is required.",
    formData.passwordErrors.short && "Password must be at least 5 characters long.",
    formData.passwordErrors.long && "Password cannot be longer than 50 characters.",
    ...formData.regErrors,
  ]
  .filter(Boolean)
  .map(errorMessage => (
    <Typography key={errorMessage} variant="subtitle" color="error" fontWeight={900}>
      - {errorMessage}
    </Typography>
  ));

  return (
    <Dialog open={registerDialogState} onClose={() => dispatch(setDialogOpened({ dialogName: "registerDialogOpen", newState: false }))}>
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
        <Typography variant="h4">Welcome to Rebound</Typography>
        <Typography variant="subtitle" sx={{ pb: 2 }}>
          Register to join a communication network like no other.
        </Typography>
        <TextField
          sx={{ pb: 2 }}
          label="Display Name"
          variant="outlined"
          value={formData.displayName}
          onChange={(e) => {handleFormDataChange('displayName', e.target.value, {})}}
          helperText="Your public display name."
          autoComplete="current-displayName"
        />
        <TextField
          sx={{ pb: 2 }}
          label="Login Name"
          variant="outlined"
          value={formData.username}
          onChange={(e) => handleFormDataChange('username', e.target.value, {})}
          helperText="Your private login name."
          autoComplete="current-username"
        />
        <TextField
          sx={{ pb: 0 }}
          label="Password"
          variant="outlined"
          value={formData.password}
          onChange={(e) => handleFormDataChange('password', e.target.value, {})}
          helperText="Your encrypted password."
          autoComplete="current-password"
        />
        <FormGroup>
          <FormControlLabel control={<Checkbox defaultChecked />} label="Stay Logged In" onChange={handleStayLoggedInChange} value={formData.stayLoggedIn} />
        </FormGroup>
        {errorMessages}
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

export default RegisterDialog;
