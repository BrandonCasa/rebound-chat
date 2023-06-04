import React, { useState } from "react";
import {
  Dialog,
  Box,
  Typography,
  TextField,
  DialogActions,
  Button,
  FormGroup,
  FormControlLabel,
  Checkbox,
  Stepper,
  Step,
  StepLabel,
  Alert,
  ButtonBase,
  Backdrop,
  Paper,
  Card,
  CardContent,
} from "@mui/material";
import { useDispatch, useSelector } from "react-redux";
import { setDialogOpened } from "../reducers/dialogReducer";
import { useTheme } from "@mui/material/styles";
import { setAuthState, setLoggedIn } from "../reducers/authReducer";
import axios from "axios";
import * as Icons from "@mui/icons-material";

const RegisterDialog = () => {
  const dispatch = useDispatch();
  const registerDialogState = useSelector((state) => state.dialogs.registerDialogOpen);
  const [activeStep, setActiveStep] = React.useState(0);

  const [formData, setFormData] = useState({
    displayName: "",
    username: "",
    password: "",
    stayLoggedIn: true,
    displayNameErrors: {},
    usernameErrors: {},
    passwordErrors: {},
    regErrors: [],
  });

  const handleFormDataChange = (field, value, errors = {}) => {
    setFormData({
      ...formData,
      [field]: value,
      [`${field}Errors`]: errors,
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
        setFormData({ ...formData, regErrors: [] });
      }
    } catch (error) {
      if (error.response && error.response.status === 400) {
        let regErrors = error.response.data.errors.map((error) => error.msg);
        setFormData({ ...formData, regErrors });
        setActiveStep(0);
      }
    }
  };

  const handleNextStep = () => {
    if (activeStep < 2) {
      setActiveStep((prevActiveStep) => prevActiveStep + 1);
    } else {
      handleUserRegister();
    }
  };

  const handleBackButton = () => {
    if (activeStep === 0) {
      dispatch(setDialogOpened({ dialogName: "loginDialogOpen", newState: true, conflictingDialogs: ["registerDialogOpen"] }));
      setFormData({
        displayName: formData.displayName,
        username: formData.username,
        password: formData.password,
        stayLoggedIn: formData.stayLoggedIn,
        displayNameErrors: {},
        usernameErrors: {},
        passwordErrors: {},
        regErrors: [],
      });
      setActiveStep(0);
    } else {
      setActiveStep((prevActiveStep) => prevActiveStep - 1);
    }
  };

  const handleDialogClose = () => {
    dispatch(setDialogOpened({ dialogName: "registerDialogOpen", newState: false }));
    setFormData({
      displayName: formData.displayName,
      username: formData.username,
      password: formData.password,
      stayLoggedIn: formData.stayLoggedIn,
      displayNameErrors: {},
      usernameErrors: {},
      passwordErrors: {},
      regErrors: [],
    });
    setActiveStep(0);
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
    .map((errorMessage) => (
      <Typography key={errorMessage} variant="subtitle" color="error" fontWeight={900}>
        - {errorMessage}
      </Typography>
    ));

  return (
    <Dialog open={registerDialogState} onClose={handleDialogClose}>
      <Box
        sx={{
          justifyContent: "center",
          display: "flex",
          p: 2,
          flexDirection: "column",
          textAlign: "center",
          minHeight: "400px",
          height: "450px",
        }}
        component="form"
      >
        <Typography variant="h4">Welcome to Rebound</Typography>
        <Typography variant="subtitle" sx={{ pb: 2 }}>
          Register to join a communication network like no other.
        </Typography>
        <Stepper sx={{ pb: 2 }} activeStep={activeStep}>
          <Step key={0} completed={activeStep > 0}>
            <StepLabel>
              <Typography variant="caption">Registration</Typography>
            </StepLabel>
          </Step>
          <Step key={1} completed={activeStep > 1}>
            <StepLabel>
              <Typography variant="caption">Profile</Typography>
            </StepLabel>
          </Step>
          <Step key={2} completed={activeStep > 2}>
            <StepLabel>
              <Typography variant="caption">Preview</Typography>
            </StepLabel>
          </Step>
        </Stepper>
        <Box sx={{ display: "flex", flexDirection: "column", flexGrow: 1 }}>
          {activeStep === 0 && (
            <React.Fragment>
              <TextField
                sx={{ pb: 2 }}
                label="Login Name"
                variant="outlined"
                value={formData.username}
                onChange={(e) => handleFormDataChange("username", e.target.value, {})}
                helperText="Your private login name."
                autoComplete="current-username"
              />
              <TextField
                sx={{ pb: 0 }}
                label="Password"
                variant="outlined"
                value={formData.password}
                onChange={(e) => handleFormDataChange("password", e.target.value, {})}
                helperText="Your encrypted password."
                autoComplete="current-password"
                type="password"
              />
            </React.Fragment>
          )}
          {activeStep === 1 && (
            <React.Fragment>
              <TextField
                sx={{ pb: 2 }}
                label="Display Name"
                variant="outlined"
                value={formData.displayName}
                onChange={(e) => {
                  handleFormDataChange("displayName", e.target.value, {});
                }}
                helperText="Your public display name."
                autoComplete="current-displayName"
              />
              <TextField
                sx={{ pb: 0 }}
                label="About Me (WIP)"
                variant="outlined"
                value={formData.displayName}
                onChange={(e) => {
                  handleFormDataChange("displayName", e.target.value, {});
                }}
                helperText="A brief description of yourself. (wont save)"
                autoComplete="current-aboutMe"
              />
            </React.Fragment>
          )}
          {activeStep === 2 && <React.Fragment>Profile Preview WIP</React.Fragment>}
        </Box>
        {errorMessages.length > 0 && (
          <Card variant="outlined" sx={{ height: "100%", height: "72px", textAlign: "start" }}>
            <Box sx={{ pl: 2, pr: 2, display: "flex", flexDirection: "column" }}>{errorMessages}</Box>
          </Card>
        )}
        <DialogActions sx={{ mr: -2, mb: -2, ml: -2 }}>
          <FormGroup>
            <FormControlLabel control={<Checkbox defaultChecked />} label="Remember Login" onChange={handleStayLoggedInChange} value={formData.stayLoggedIn} />
          </FormGroup>
          <Button variant="outlined" onClick={handleBackButton}>
            Back
          </Button>
          <Button autoFocus variant="contained" onClick={handleNextStep}>
            {activeStep === 2 ? <Icons.DoneRounded /> : <Icons.KeyboardDoubleArrowRightRounded />}
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
};

export default RegisterDialog;
