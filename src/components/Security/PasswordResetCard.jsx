import React, { useMemo, useState } from "react";
import { Alert, Box, Button, Card, CardContent, CardHeader, Divider, Stack, TextField, Typography } from "@mui/material";
import LockResetRoundedIcon from "@mui/icons-material/LockResetRounded";
import { useDispatch, useSelector } from "react-redux";

import { changePassword } from "../../slices/authSlice";
import { setDialogOpened } from "../../slices/dialogSlice";
import { addSnackbar } from "../../slices/snackbarSlice";

const MIN_PASSWORD_LENGTH = 8;

export default function PasswordResetCard() {
	const dispatch = useDispatch();
	const { passwordChanging, loggedIn } = useSelector((state) => state.auth);

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
						Update password
					</Typography>
				}
				subheader={
					<Typography variant="body2" color="text.secondary">
						Set a new password for your account. You will need to log back in afterward.
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
						inputProps={{ "data-testid": "password-reset-current-input" }}
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
						inputProps={{ "data-testid": "password-reset-new-input" }}
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
						inputProps={{ "data-testid": "password-reset-confirm-input" }}
					/>

					<Box sx={{ display: "flex", justifyContent: "flex-end" }}>
						<Button type="submit" variant="contained" disabled={isSubmitDisabled} data-testid="password-reset-submit-button">
							{passwordChanging ? "Updating..." : "Change password"}
						</Button>
					</Box>
				</Stack>
			</CardContent>
		</Card>
	);
}
