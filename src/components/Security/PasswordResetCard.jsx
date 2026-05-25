import React, { useMemo, useState } from "react";
import { Alert, Box, Button, Card, CardContent, CardHeader, Divider, Stack, TextField, Typography } from "@mui/material";
import LockResetRoundedIcon from "@mui/icons-material/LockResetRounded";
import { useDispatch, useSelector } from "react-redux";

import { changePassword } from "../../slices/authSlice";
import { setDialogOpened } from "../../slices/dialogSlice";
import { addSnackbar } from "../../slices/snackbarSlice";
import usePasswordResetFlow from "../../hooks/usePasswordResetFlow";

const MIN_PASSWORD_LENGTH = 8;

export default function PasswordResetCard() {
	const dispatch = useDispatch();
	const { email: accountEmail, passwordChanging, loggedIn } = useSelector((state) => state.auth);
	const resetFlow = usePasswordResetFlow({
		initialEmail: accountEmail,
		onResetConfirmed: () =>
			dispatch(
				setDialogOpened({
					dialogName: "loginDialogOpen",
					newState: true,
					conflictingDialogs: ["registerDialogOpen"],
				})
			),
	});

	const [form, setForm] = useState({
		currentPassword: "",
		newPassword: "",
		confirmPassword: "",
	});
	const [errors, setErrors] = useState({});
	const [serverError, setServerError] = useState(null);

	const isSubmitDisabled = useMemo(() => passwordChanging || !loggedIn, [passwordChanging, loggedIn]);

	const updateField = (field, value) => {
		setForm((prev) => ({ ...prev, [field]: value }));
		setErrors((prev) => ({ ...prev, [field]: undefined }));
	};

	const validate = () => {
		const nextErrors = {};
		const trimmedCurrent = form.currentPassword.trim();
		const trimmedNew = form.newPassword.trim();
		const trimmedConfirm = form.confirmPassword.trim();

		if (!trimmedCurrent) {
			nextErrors.currentPassword = "Current password is required";
		}

		if (!trimmedNew) {
			nextErrors.newPassword = "New password is required";
		} else if (trimmedNew.length < MIN_PASSWORD_LENGTH) {
			nextErrors.newPassword = `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
		}

		if (trimmedConfirm !== trimmedNew) {
			nextErrors.confirmPassword = "Passwords do not match";
		}

		setErrors(nextErrors);
		return Object.keys(nextErrors).length === 0;
	};

	const handleSubmit = async (event) => {
		event.preventDefault();
		setServerError(null);

		if (!validate()) return;

		try {
			await dispatch(
				changePassword({
					currentPassword: form.currentPassword.trim(),
					newPassword: form.newPassword.trim(),
				})
			).unwrap();

			setForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
			setErrors({});

			dispatch(
				addSnackbar({
					snackbarMsg: "Password updated. Please log in again.",
					snackbarSeverity: "success",
					autoHideDuration: 4000,
				})
			);
			dispatch(
				setDialogOpened({
					dialogName: "loginDialogOpen",
					newState: true,
					conflictingDialogs: ["registerDialogOpen"],
				})
			);
		} catch (err) {
			const fieldErrors = err?.errors || {};
			const fallbackMessage = typeof err === "string" ? err : typeof err?.error === "string" ? err.error : "Unable to update password";

			setErrors((prev) => ({ ...prev, ...fieldErrors }));
			setServerError(fieldErrors?.currentPassword || fieldErrors?.newPassword ? null : fallbackMessage);

			dispatch(
				addSnackbar({
					snackbarMsg: fallbackMessage,
					snackbarSeverity: "error",
					autoHideDuration: 4000,
				})
			);
		}
	};

	const handleRecoverySubmit = async (event) => {
		event.preventDefault();

		try {
			if (resetFlow.step === "confirm") {
				await resetFlow.submitConfirm();
				return;
			}

			await resetFlow.submitRequest();
		} catch {
			// The hook maps failures into field errors and snackbars.
		}
	};

	return (
		<Card
			data-testid="password-reset-card"
			elevation={0}
			sx={(theme) => ({
				borderRadius: "16px",
				border: `1px solid ${theme.palette.divider}`,
			})}>
			<CardHeader
				avatar={
					<Box
						sx={(theme) => ({
							width: 40,
							height: 40,
							borderRadius: 1,
							display: "flex",
							alignItems: "center",
							justifyContent: "center",
							bgcolor: theme.palette.primary.main,
							color: theme.palette.primary.contrastText,
						})}>
						<LockResetRoundedIcon fontSize="small" />
					</Box>
				}
				title={
					<Typography variant="h6" sx={{ fontWeight: 600 }}>
						Password
					</Typography>
				}
				subheader={
					<Typography variant="body2" color="text.secondary">
						Update your password or send a secure recovery link to your account email.
					</Typography>
				}
				sx={{ pb: 0 }}
			/>

			<Divider flexItem />

			<CardContent component="form" onSubmit={handleSubmit} data-testid="password-reset-form">
				<Stack spacing={2}>
					{serverError && (
						<Alert severity="error" data-testid="password-reset-server-error">
							{serverError}
						</Alert>
					)}
					{!loggedIn && (
						<Alert severity="info" data-testid="password-reset-login-required">
							You need to be logged in to change your password.
						</Alert>
					)}

					<TextField
						label="Current password"
						type="password"
						autoComplete="current-password"
						required
						value={form.currentPassword}
						onChange={(e) => updateField("currentPassword", e.target.value)}
						error={Boolean(errors.currentPassword)}
						helperText={errors.currentPassword}
						fullWidth
						slotProps={{ htmlInput: { "data-testid": "password-reset-current-input" } }}
					/>
					<TextField
						label="New password"
						type="password"
						autoComplete="new-password"
						required
						value={form.newPassword}
						onChange={(e) => updateField("newPassword", e.target.value)}
						error={Boolean(errors.newPassword)}
						helperText={errors.newPassword || `At least ${MIN_PASSWORD_LENGTH} characters`}
						fullWidth
						slotProps={{ htmlInput: { "data-testid": "password-reset-new-input" } }}
					/>
					<TextField
						label="Confirm new password"
						type="password"
						autoComplete="new-password"
						required
						value={form.confirmPassword}
						onChange={(e) => updateField("confirmPassword", e.target.value)}
						error={Boolean(errors.confirmPassword)}
						helperText={errors.confirmPassword}
						fullWidth
						slotProps={{ htmlInput: { "data-testid": "password-reset-confirm-input" } }}
					/>

					<Box sx={{ display: "flex", justifyContent: "flex-end" }}>
						<Button type="submit" variant="contained" disabled={isSubmitDisabled} data-testid="password-reset-submit-button">
							{passwordChanging ? "Updating..." : "Change password"}
						</Button>
					</Box>
				</Stack>
			</CardContent>

			<Divider flexItem />

			<CardContent component="form" onSubmit={handleRecoverySubmit} data-testid="password-recovery-form">
				<Stack spacing={2}>
					<Box>
						<Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
							Email a password reset link
						</Typography>
						<Typography variant="body2" color="text.secondary">
							We will send a recovery email with a link that expires in one hour. Use this if you forgot your password or want to reset it from another device.
						</Typography>
					</Box>

					{resetFlow.message && (
						<Alert severity="success" data-testid="password-recovery-message">
							{resetFlow.message}
						</Alert>
					)}

					{resetFlow.step === "request" && (
						<TextField
							label="Account email"
							type="email"
							autoComplete="email"
							required
							value={resetFlow.form.email}
							onChange={(e) => resetFlow.updateField("email", e.target.value)}
							error={Boolean(resetFlow.errors.email)}
							helperText={resetFlow.errors.email || "Enter the email address on your account."}
							fullWidth
							slotProps={{ htmlInput: { "data-testid": "password-recovery-email-input" } }}
						/>
					)}

					{resetFlow.step === "confirm" && (
						<>
							<TextField
								label="Reset token"
								autoComplete="one-time-code"
								required
								value={resetFlow.form.token}
								onChange={(e) => resetFlow.updateField("token", e.target.value)}
								error={Boolean(resetFlow.errors.token)}
								helperText={resetFlow.errors.token || "Paste the token from your recovery email."}
								fullWidth
								slotProps={{ htmlInput: { "data-testid": "password-recovery-token-input" } }}
							/>
							<TextField
								label="New password"
								type="password"
								autoComplete="new-password"
								required
								value={resetFlow.form.newPassword}
								onChange={(e) => resetFlow.updateField("newPassword", e.target.value)}
								error={Boolean(resetFlow.errors.newPassword)}
								helperText={resetFlow.errors.newPassword || `At least ${MIN_PASSWORD_LENGTH} characters`}
								fullWidth
								slotProps={{ htmlInput: { "data-testid": "password-recovery-new-password-input" } }}
							/>
							<TextField
								label="Confirm new password"
								type="password"
								autoComplete="new-password"
								required
								value={resetFlow.form.confirmPassword}
								onChange={(e) => resetFlow.updateField("confirmPassword", e.target.value)}
								error={Boolean(resetFlow.errors.confirmPassword)}
								helperText={resetFlow.errors.confirmPassword}
								fullWidth
								slotProps={{ htmlInput: { "data-testid": "password-recovery-confirm-password-input" } }}
							/>
						</>
					)}

					<Box sx={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 1 }}>
						<Button
							type="button"
							variant="outlined"
							onClick={resetFlow.step === "request" ? resetFlow.switchToConfirm : resetFlow.switchToRequest}
							data-testid="password-recovery-toggle-button">
							{resetFlow.step === "request" ? "I have a token" : "Back to email"}
						</Button>
						<Button
							type="submit"
							variant="contained"
							disabled={resetFlow.requestPending || resetFlow.confirmPending}
							data-testid="password-recovery-submit-button">
							{resetFlow.step === "request"
								? resetFlow.requestPending
									? "Sending..."
									: "Send recovery email"
								: resetFlow.confirmPending
									? "Resetting..."
									: "Reset password"}
						</Button>
					</Box>
				</Stack>
			</CardContent>
		</Card>
	);
}
