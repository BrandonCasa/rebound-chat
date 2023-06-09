import { Typography } from "@mui/material";
import axios from "axios";
import React, { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { setAuthState, setLoggedIn } from "reducers/authReducer";
import { setDialogOpened } from "reducers/dialogReducer";

const useRegisterDialog = () => {
  const dispatch = useDispatch();
  const registerDialogState = useSelector((state) => state.dialogs.registerDialogOpen);
  const [activeStep, setActiveStep] = useState(0);

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

  const validateUsername = (value) => {
    let errors = {};

    if (value === undefined || value === null || value === "") {
      errors.undefined = true;
    }
    if (typeof value === "string" && value.toString().includes(" ")) {
      errors.spaces = true;
    }
    if (value !== value.toLowerCase()) {
      errors.case = true;
    }
    if (value.length < 3) {
      errors.short = true;
    }
    if (value.length > 24) {
      errors.long = true;
    }
    return errors;
  };

  const validatePassword = (value) => {
    let errors = {};

    if (value === undefined || value === null || value === "") {
      errors.undefined = true;
    }
    if (typeof value === "string" && value.toString().includes(" ")) {
      errors.spaces = true;
    }
    if (value.length < 5) {
      errors.short = true;
    }
    if (value.length > 50) {
      errors.long = true;
    }
    return errors;
  };

  const validateDisplayName = (value) => {
    let errors = {};

    if (value === undefined || value === null || value === "") {
      errors.undefined = true;
    }
    if (typeof value === "string" && (value.toString().startsWith(" ") || value.toString().endsWith(" "))) {
      errors.spaces = true;
    }
    if (value.length < 3) {
      errors.short = true;
    }
    if (value.length > 16) {
      errors.long = true;
    }
    return errors;
  };

  const handleFormDataChange = (field, value, errors = {}) => {
    setFormData({
      ...formData,
      [field]: value,
      usernameErrors: field === "username" ? { ...validateUsername(value) } : { ...formData.usernameErrors },
      passwordErrors: field === "password" ? { ...validatePassword(value) } : { ...formData.passwordErrors },
      displayNameErrors: field === "displayName" ? { ...validateDisplayName(value) } : { ...formData.displayNameErrors },
      regErrors: [],
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

  const handleToLogin = () => {
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

  return {
    registerDialogState,
    activeStep,
    setActiveStep,
    formData,
    setFormData,
    handleFormDataChange,
    handleStayLoggedInChange,
    handleUserRegister,
    handleNextStep,
    handleBackButton,
    handleDialogClose,
    errorMessages,
    handleToLogin,
  };
};

export default useRegisterDialog;
