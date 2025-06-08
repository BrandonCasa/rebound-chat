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
		setFormData((prev) => {
			const next = { ...prev, [field]: value };
			next.bioErrors = field === "bio" || errors?.bio ? { ...validateBio(field === "bio" ? value : prev.bio, errors?.bio) } : { ...prev.bioErrors };
			next.emailErrors =
				field === "email" || errors?.email
					? {
							...validateEmail(field === "email" ? value : prev.email, errors?.email),
						}
					: { ...prev.emailErrors };
			next.usernameErrors =
				field === "username" || errors?.username
					? {
							...validateUsername(field === "username" ? value : prev.username, errors?.username),
						}
					: { ...prev.usernameErrors };
			next.passwordErrors =
				field === "password" || errors?.password
					? {
							...validatePassword(field === "password" ? value : prev.password, errors?.password),
						}
					: { ...prev.passwordErrors };
			next.displayNameErrors =
				field === "displayName" || errors?.displayName
					? {
							...validateDisplayName(field === "displayName" ? value : prev.displayName, errors?.displayName),
						}
					: { ...prev.displayNameErrors };
			return next;
		});
	};

	const handleStayLoggedInChange = (event) => {
		setFormData((prev) => ({ ...prev, stayLoggedIn: event.target.checked }));
	};

	const stepHasErrors = (step) => {
		if (step === 0) {
			return Object.keys(formData.usernameErrors).length > 0 || Object.keys(formData.emailErrors).length > 0 || Object.keys(formData.passwordErrors).length > 0;
		}
		if (step === 1) {
			return Object.keys(formData.displayNameErrors).length > 0 || Object.keys(formData.bioErrors).length > 0;
		}
		return false;
	};

	const hasAnyErrors = () =>
		[formData.usernameErrors, formData.emailErrors, formData.passwordErrors, formData.displayNameErrors, formData.bioErrors].some(
			(err) => Object.keys(err).length > 0
		);

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
				dispatch(
					addSnackbar({
						snackbarMsg: "Registration Successful!",
						snackbarSeverity: "success",
						autoHideDuration: 4000,
					})
				);
			}
		} catch (error) {
			const serverErrors = error?.response?.data?.errors;
			if (!serverErrors) {
				dispatch(
					addSnackbar({
						snackbarMsg: `Registration Failed! ${error?.message || "Unknown error."}`,
						snackbarSeverity: "error",
						autoHideDuration: 4000,
					})
				);
			} else {
				const updateErrors = {};
				Object.entries(serverErrors).forEach(([field, msg]) => {
					if (!msg) return;
					const message = Array.isArray(msg) ? msg.join(", ") : msg;
					updateErrors[field] = message;
					dispatch(
						addSnackbar({
							snackbarMsg: `${field.charAt(0).toUpperCase() + field.slice(1)} ${message}`,
							snackbarSeverity: "error",
							autoHideDuration: 4000,
						})
					);
				});

				// apply all server errors at once
				setFormData((prev) => {
					const next = { ...prev };
					if (updateErrors.username)
						next.usernameErrors = {
							...validateUsername(prev.username, updateErrors.username),
						};
					if (updateErrors.email)
						next.emailErrors = {
							...validateEmail(prev.email, updateErrors.email),
						};
					if (updateErrors.password)
						next.passwordErrors = {
							...validatePassword(prev.password, updateErrors.password),
						};
					if (updateErrors.displayName)
						next.displayNameErrors = {
							...validateDisplayName(prev.displayName, updateErrors.displayName),
						};
					if (updateErrors.bio)
						next.bioErrors = {
							...validateBio(prev.bio, updateErrors.bio),
						};
					return next;
				});
			}
			setActiveStep(0);
		}
	};

	const handleNextStep = () => {
		if (stepHasErrors(activeStep)) {
			dispatch(
				addSnackbar({
					snackbarMsg: "Please resolve validation errors before continuing.",
					snackbarSeverity: "warning",
					autoHideDuration: 4000,
				})
			);
			return;
		}

		if (activeStep < 2) {
			setActiveStep((prevActiveStep) => prevActiveStep + 1);
		} else {
			if (hasAnyErrors()) {
				dispatch(
					addSnackbar({
						snackbarMsg: "Please resolve validation errors before registering.",
						snackbarSeverity: "warning",
						autoHideDuration: 4000,
					})
				);
				return;
			}
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
