import { Dialog, Box, Typography, TextField, DialogActions, Button, FormGroup, FormControlLabel, Checkbox } from "@mui/material";
import React, { useState } from "react";
import GoogleButton from "react-google-button";
import { getApiBase } from "../helpers/api";
import { useDispatch, useSelector } from "react-redux";

import { loginUser } from "../slices/authSlice";
import { setDialogOpened } from "../slices/dialogSlice";

import { addSnackbar } from "../slices/snackbarSlice";

const LoginDialog = () => {
	const loginDialogState = useSelector((state) => state.dialogs.loginDialogOpen);
	const dispatch = useDispatch();

        const [email, setEmail] = useState("");
        const [password, setPassword] = useState("");

        const handleUserLogin = () => {
                dispatch(loginUser({ email, password }))
                        .unwrap()
                        .then((user) => {
                                dispatch(setDialogOpened({ dialogName: "loginDialogOpen", newState: false }));
                                dispatch(
                                        addSnackbar({
                                                snackbarMsg: `Login Successful. Hello ${user.displayName}`,
                                                snackbarSeverity: "success",
                                                autoHideDuration: 2000,
                                        })
                                );
                        })
                        .catch((error) => {
				console.log(error);
				const loginErrors = error?.errors;
				if (!loginErrors) {
					dispatch(
						addSnackbar({
							snackbarMsg: `Login failed, ${JSON.stringify(error) || "Unknown error."}!`,
							snackbarSeverity: "error",
							autoHideDuration: 4000,
						})
					);
				} else {
					const updateErrors = {};
					Object.entries(loginErrors).forEach(([field, msg]) => {
						if (!msg) return;
						const message = Array.isArray(msg) ? msg.join(", ") : msg;
						updateErrors[field] = message;
						dispatch(
							addSnackbar({
								snackbarMsg: `Login failed, ${field.charAt(0).toUpperCase() + field.slice(1)} ${message}!`,
								snackbarSeverity: "error",
								autoHideDuration: 4000,
							})
						);
					});
				}
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
				component="form">
				<Typography variant="h4" sx={{ pb: 2 }}>
					Rebound Login
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

				<Box sx={{ display: "flex", justifyContent: "center", py: 1 }}>
					<GoogleButton
						onClick={() => {
							window.location.href = `${getApiBase()}/users/google`;
						}}
					/>
				</Box>
			</Box>
			<DialogActions>
				<Button
					variant="outlined"
					fullWidth
					onClick={() =>
						dispatch(
							setDialogOpened({
								dialogName: "registerDialogOpen",
								newState: true,
								conflictingDialogs: ["loginDialogOpen"],
							})
						)
					}>
					New Account
				</Button>
				<Button variant="contained" onClick={handleUserLogin}>
					Login
				</Button>
			</DialogActions>
		</Dialog>
	);
};

export default LoginDialog;
