import { Typography } from "@mui/material";
import axios from "axios";
import React, { useState } from "react";
import { useDispatch, useSelector } from "react-redux";

import { setAuthState, setLoggedIn } from "../../slices/authSlice";
import { setDialogOpened } from "../../slices/dialogSlice";

import { addSnackbar } from "../../slices/snackbarSlice";

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
	});

	const validateBio = (value, altError) => {
		let errors = {};

		if (value.length > 256) {
			errors.long = true;
		}
		if (altError) {
			errors = { ...errors, altError: `Bio ${altError}` };
		}
		return errors;
	};

	const validateEmail = (value, altError) => {
		let errors = {};

		if (value === undefined || value === null || value === "") {
			errors.undefined = true;
			return errors;
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
		if (altError) {
			errors = { ...errors, altError: `Email ${altError}` };
		}
		return errors;
	};

	const validateUsername = (value, altError) => {
		let errors = {};

		if (value === undefined || value === null || value == "") {
			errors.undefined = true;
			return errors;
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
		if (altError) {
			errors = { ...errors, altError: `Username ${altError}` };
		}
		return errors;
	};

	const validatePassword = (value, altError) => {
		let errors = {};

		if (value === undefined || value === null || value === "") {
			errors.undefined = true;
			return errors;
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
		if (altError) {
			errors = { ...errors, altError: `Password ${altError}` };
		}
		return errors;
	};

	const validateDisplayName = (value, altError) => {
		let errors = {};

		if (value === undefined || value === null || value === "") {
			errors.undefined = true;
			return errors;
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
		if (altError) {
			errors = { ...errors, altError: `Display Name ${altError}` };
		}
		return errors;
	};

	const handleFormDataChange = (field, value, errors = {}) => {
		setFormData({
			...formData,
			[field]: value,
			bioErrors: field === "bio" || errors?.bio ? { ...validateBio(value, errors?.bio) } : { ...formData.bioErrors },
			emailErrors: field === "email" || errors?.email ? { ...validateEmail(value, errors?.email) } : { ...formData.emailErrors },
			usernameErrors: field === "username" || errors?.username ? { ...validateUsername(value, errors?.username) } : { ...formData.usernameErrors },
			passwordErrors: field === "password" || errors?.password ? { ...validatePassword(value, errors?.password) } : { ...formData.passwordErrors },
			displayNameErrors: field === "displayName" || errors?.displayName ? { ...validateDisplayName(value, errors?.displayName) } : { ...formData.displayNameErrors },
		});
	};

	const handleStayLoggedInChange = (event) => {
		setFormData({ ...formData, stayLoggedIn: event.target.checked });
	};

	const handleUserRegister = async () => {
		let requestString = process.env.NODE_ENV === "development" ? `http://localhost:6001/api/users/register` : `/api/users/register`;
		requestString = process.env.NODE_ENV !== "development" && window.isElectron ? `https://rebound.nexus/api/users/register` : requestString;

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
				dispatch(
					setDialogOpened({
						dialogName: "registerDialogOpen",
						newState: false,
					})
				);
				setFormData({ ...formData });
			}
		} catch (error) {
			if (!error?.response?.data?.errors) {
				dispatch(
					addSnackbar({
						snackbarMsg: `Registration Failed! ${JSON.stringify(error?.response?.data?.errors || error?.message || "An unknown error occurred.")}`,
						snackbarSeverity: "error",
						autoHideDuration: 4000,
					})
				);
			} else {
				handleFormDataChange("password", formData.password, {});
				handleFormDataChange("bio", formData.bio, {});
				handleFormDataChange("email", formData.email, {});
				handleFormDataChange("displayName", formData.displayName, {});
				handleFormDataChange("username", formData.username, {});

				handleFormDataChange("requestErrors", undefined, error?.response?.data?.errors);

				if (error?.response?.data?.errors) {
					// display a snackbar for each error and prefix the error with the field name
					for (const [field, errorMessages] of Object.entries(error?.response?.data?.errors)) {
						if (Array.isArray(errorMessages)) {
							errorMessages.forEach((errorMessage) => {
								dispatch(
									addSnackbar({
										snackbarMsg: `${field.charAt(0).toUpperCase() + field.slice(1)} ${errorMessage}`,
										snackbarSeverity: "error",
										autoHideDuration: 4000,
									})
								);
							});
						} else {
							dispatch(
								addSnackbar({
									snackbarMsg: `${field.charAt(0).toUpperCase() + field.slice(1)} ${errorMessages}`,
									snackbarSeverity: "error",
									autoHideDuration: 4000,
								})
							);
						}
					}
				}
			}
			setActiveStep(0);
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
			dispatch(
				setDialogOpened({
					dialogName: "loginDialogOpen",
					newState: true,
					conflictingDialogs: ["registerDialogOpen"],
				})
			);
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
		});
		setActiveStep(0);
	};

	const handleToLogin = () => {
		dispatch(
			setDialogOpened({
				dialogName: "loginDialogOpen",
				newState: true,
				conflictingDialogs: ["registerDialogOpen"],
			})
		);
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
		});
		setActiveStep(0);
	};

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
		handleToLogin,
	};
};

export default useRegisterDialog;
