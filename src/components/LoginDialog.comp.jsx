import { Alert, Dialog, Box, Typography, TextField, DialogActions, Button, Link, Stack } from "@mui/material";
import React, { useCallback, useState } from "react";
import GoogleButton from "react-google-button";
import { getApiBase } from "../helpers/api";
import { useDispatch, useSelector } from "react-redux";

import usePasswordResetFlow from "../hooks/usePasswordResetFlow";
import { loginWithPassword } from "../slices/authSlice";
import { setDialogOpened } from "../slices/dialogSlice";

import { addSnackbar } from "../slices/snackbarSlice";

const LoginDialog = () => {
	const loginDialogState = useSelector((state) => state.dialogs.loginDialogOpen);
	const dispatch = useDispatch();

	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [mode, setMode] = useState("login");

	const handleTokenFromQuery = useCallback(() => {
		setMode("reset");
		dispatch(setDialogOpened({ dialogName: "loginDialogOpen", newState: true }));
	}, [dispatch]);

	const handleResetConfirmed = useCallback(() => {
		setPassword("");
		setMode("login");
	}, []);

	const resetFlow = usePasswordResetFlow({
		readTokenFromQuery: true,
		onTokenFromQuery: handleTokenFromQuery,
		onResetConfirmed: handleResetConfirmed,
	});

	const handleUserLogin = () => {
		dispatch(loginWithPassword({ email, password }))
			.then(() => setPassword(""))
			.catch(() => {});
	};

	const handleGoogleLogin = async () => {
		const redirectTarget = `${window.location.origin}${window.location.pathname}${window.location.search}${window.location.hash}`;

		if (window.electronAPI?.auth?.startGoogleLogin) {
			try {
				await window.electronAPI.auth.startGoogleLogin(redirectTarget);
				return;
			} catch (error) {
				dispatch(
					addSnackbar({
						snackbarMsg: `Google sign-in failed, ${error?.message || "unable to open sign-in window."}`,
						snackbarSeverity: "error",
						autoHideDuration: 4000,
					})
				);
				return;
			}
		}

		window.location.href = `${getApiBase()}/users/google?redirect=${encodeURIComponent(redirectTarget)}`;
	};

	const handleClose = () => {
		setMode("login");
		resetFlow.resetFlow();
		dispatch(setDialogOpened({ dialogName: "loginDialogOpen", newState: false }));
	};

	const handleRequestPasswordReset = () => {
		resetFlow
			.submitRequest()
			.then((result) => {
				if (result?.resetToken) setMode("reset");
			})
			.catch(() => {});
	};

	const handleConfirmPasswordReset = () => {
		resetFlow.submitConfirm().catch(() => {});
	};

	const handleSubmit = (event) => {
		event.preventDefault();

		if (mode === "forgot") {
			handleRequestPasswordReset();
			return;
		}

		if (mode === "reset") {
			handleConfirmPasswordReset();
			return;
		}

		handleUserLogin();
	};

	const handleForgotPassword = () => {
		resetFlow.updateField("email", email);
		resetFlow.switchToRequest();
		setMode("forgot");
	};

	const handleHaveToken = () => {
		resetFlow.switchToConfirm();
		setMode("reset");
	};

	return (
		<Dialog open={loginDialogState} onClose={handleClose} data-testid="login-dialog">
			<Box
				data-testid="login-dialog-form"
				sx={{
					maxWidth: "500px",
					justifyContent: "center",
					display: "flex",
					p: 2,
					flexDirection: "column",
					textAlign: "center",
				}}
				component="form"
				onSubmit={handleSubmit}>
				<Typography variant="h4" sx={{ pb: 2 }}>
					{mode === "login" ? "Rebound Login" : mode === "forgot" ? "Reset password" : "Set new password"}
				</Typography>
				{mode === "login" && (
					<>
						<TextField
							sx={{ pb: 2 }}
							label="Email"
							variant="outlined"
							value={email}
							type="email"
							slotProps={{ htmlInput: { "data-testid": "login-email-input" } }}
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
							slotProps={{ htmlInput: { "data-testid": "login-password-input" } }}
							onChange={(e) => {
								setPassword(e.target.value);
							}}
							autoComplete="current-password"
						/>
						<Box sx={{ display: "flex", justifyContent: "flex-end", pt: 0.5 }}>
							<Link component="button" type="button" variant="body2" onClick={handleForgotPassword}>
								Forgot password?
							</Link>
						</Box>

						<Box sx={{ display: "flex", justifyContent: "center", py: 1 }} data-testid="login-google-button-wrapper">
							<GoogleButton onClick={handleGoogleLogin} />
						</Box>
					</>
				)}

				{mode === "forgot" && (
					<Stack spacing={2}>
						{resetFlow.message && <Alert severity="info">{resetFlow.message}</Alert>}
						<TextField
							label="Email"
							variant="outlined"
							value={resetFlow.form.email}
							type="email"
							slotProps={{ htmlInput: { "data-testid": "password-reset-email-input" } }}
							onChange={(e) => {
								resetFlow.updateField("email", e.target.value);
							}}
							error={Boolean(resetFlow.errors.email)}
							helperText={resetFlow.errors.email}
							autoComplete="email"
						/>
					</Stack>
				)}

				{mode === "reset" && (
					<Stack spacing={2}>
						{resetFlow.message && <Alert severity="info">{resetFlow.message}</Alert>}
						<TextField
							label="Reset token"
							variant="outlined"
							value={resetFlow.form.token}
							slotProps={{ htmlInput: { "data-testid": "password-reset-token-input" } }}
							onChange={(e) => {
								resetFlow.updateField("token", e.target.value);
							}}
							error={Boolean(resetFlow.errors.token)}
							helperText={resetFlow.errors.token}
							autoComplete="one-time-code"
						/>
						<TextField
							label="New password"
							variant="outlined"
							type="password"
							value={resetFlow.form.newPassword}
							slotProps={{ htmlInput: { "data-testid": "password-reset-new-password-input" } }}
							onChange={(e) => {
								resetFlow.updateField("newPassword", e.target.value);
							}}
							error={Boolean(resetFlow.errors.newPassword)}
							helperText={resetFlow.errors.newPassword}
							autoComplete="new-password"
						/>
						<TextField
							label="Confirm new password"
							variant="outlined"
							type="password"
							value={resetFlow.form.confirmPassword}
							slotProps={{ htmlInput: { "data-testid": "password-reset-confirm-password-input" } }}
							onChange={(e) => {
								resetFlow.updateField("confirmPassword", e.target.value);
							}}
							error={Boolean(resetFlow.errors.confirmPassword)}
							helperText={resetFlow.errors.confirmPassword}
							autoComplete="new-password"
						/>
					</Stack>
				)}
			</Box>
			<DialogActions>
				{mode === "login" && (
					<>
						<Button
							variant="outlined"
							fullWidth
							data-testid="login-new-account-button"
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
						<Button type="button" variant="contained" onClick={handleUserLogin} data-testid="login-submit-button">
							Login
						</Button>
					</>
				)}
				{mode === "forgot" && (
					<>
						<Button variant="outlined" onClick={() => setMode("login")}>
							Back
						</Button>
						<Button variant="outlined" onClick={handleHaveToken} data-testid="password-reset-have-token-button">
							I have a token
						</Button>
						<Button
							type="button"
							variant="contained"
							onClick={handleRequestPasswordReset}
							disabled={resetFlow.requestPending}
							data-testid="password-reset-request-button">
							{resetFlow.requestPending ? "Sending..." : "Send reset"}
						</Button>
					</>
				)}
				{mode === "reset" && (
					<>
						<Button variant="outlined" onClick={() => setMode("login")}>
							Back
						</Button>
						<Button
							type="button"
							variant="contained"
							onClick={handleConfirmPasswordReset}
							disabled={resetFlow.confirmPending}
							data-testid="password-reset-confirm-button">
							{resetFlow.confirmPending ? "Resetting..." : "Reset password"}
						</Button>
					</>
				)}
			</DialogActions>
		</Dialog>
	);
};

export default LoginDialog;
