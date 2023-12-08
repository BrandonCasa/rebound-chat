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
    bio: "",
    email: "",
    displayName: "",
    username: "",
    password: "",
    stayLoggedIn: true,
    bioErrors: {},
    emailErrors: {},
    displayNameErrors: {},
    usernameErrors: {},
    passwordErrors: {},
    regErrors: [],
  });

  const validateBio = (value) => {
    let errors = {};

    if (value.length > 256) {
      errors.long = true;
    }
    return errors;
  };

  const validateEmail = (value) => {
    let errors = {};

    if (value === undefined || value === null || value === "") {
      errors.undefined = true;
    }
    if (typeof value === "string" && value.toString().includes(" ")) {
      errors.spaces = true;
    }
    if (!value.toString().includes("@") || !value.toString().split("@")[1].includes(".")) {
      errors.emailFormat = true;
    }
    if (value !== value.toLowerCase()) {
      errors.case = true;
    }
    if (value.length > 128) {
      errors.long = true;
    }
    return errors;
  };

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
      bioErrors: field === "bio" ? { ...validateBio(value) } : { ...formData.bioErrors },
      emailErrors: field === "email" ? { ...validateEmail(value) } : { ...formData.emailErrors },
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
      requestString = "http://localhost:6001/api/users/register";
    } else {
      requestString = "/api/users/register";
    }

    try {
      const response = await axios.post(requestString, {
        user: {
          username: formData.username,
          email: formData.email,
          displayName: formData.displayName,
          bio: formData.bio,
          password: formData.password,
          //formData.stayLoggedIn,
        },
      });

      if (response.status === 200) {
        const authToken = response.data.user.token;
        window.localStorage.setItem("auth-token", authToken);
        dispatch(setAuthState({ authToken }));
        dispatch(setLoggedIn({ loggedIn: true }));
        dispatch(setDialogOpened({ dialogName: "registerDialogOpen", newState: false }));
        setFormData({ ...formData, regErrors: [] });
      }
    } catch (error) {
      if (error.response) {
        console.log(error.response.data.errors);
        //let regErrors = error.response.data.errors.map((error) => error.msg);
        //setFormData({ ...formData, regErrors });
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
        bio: formData.bio,
        email: formData.email,
        displayName: formData.displayName,
        username: formData.username,
        password: formData.password,
        stayLoggedIn: formData.stayLoggedIn,
        bioErrors: {},
        emailErrors: {},
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
      bio: formData.bio,
      email: formData.email,
      displayName: formData.displayName,
      username: formData.username,
      password: formData.password,
      stayLoggedIn: formData.stayLoggedIn,
      bioErrors: {},
      emailErrors: {},
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
      bio: formData.bio,
      email: formData.email,
      displayName: formData.displayName,
      username: formData.username,
      password: formData.password,
      stayLoggedIn: formData.stayLoggedIn,
      bioErrors: {},
      emailErrors: {},
      displayNameErrors: {},
      usernameErrors: {},
      passwordErrors: {},
      regErrors: [],
    });
    setActiveStep(0);
  };

  const errorMessages = [
    formData.bioErrors.long && "Bio is too long.",

    formData.emailErrors.spaces && "Email must not contain spaces.",
    formData.emailErrors.undefined && "Email is required.",
    formData.emailErrors.emailFormat && "Email has invalid format.",
    formData.emailErrors.long && "Email is too long.",
    formData.emailErrors.case && "Email must be lowercase.",

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
