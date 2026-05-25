import { useCallback, useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";

import { confirmPasswordReset, requestPasswordReset } from "../slices/authSlice";
import { addSnackbar } from "../slices/snackbarSlice";

const MIN_PASSWORD_LENGTH = 8;
const DEFAULT_RESET_MESSAGE = "If an account exists for that email, a password reset link has been sent.";

const emptyForm = {
	email: "",
	token: "",
	newPassword: "",
	confirmPassword: "",
};

const errorMessageFor = (err, fallback) => (typeof err === "string" ? err : typeof err?.error === "string" ? err.error : fallback);

const clearPasswordResetQueryParam = () => {
	if (typeof window === "undefined" || !window.history?.replaceState) return;

	const url = new URL(window.location.href);
	if (!url.searchParams.has("resetToken")) return;

	url.searchParams.delete("resetToken");
	window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
};

export default function usePasswordResetFlow({ initialEmail = "", readTokenFromQuery = false, onTokenFromQuery, onResetConfirmed } = {}) {
	const dispatch = useDispatch();
	const { passwordResetRequestPending, passwordResetConfirmPending } = useSelector((state) => state.auth);

	const [step, setStep] = useState("request");
	const [form, setForm] = useState({ ...emptyForm, email: initialEmail });
	const [errors, setErrors] = useState({});
	const [message, setMessage] = useState("");

	useEffect(() => {
		if (!initialEmail) return;
		setForm((prev) => (prev.email ? prev : { ...prev, email: initialEmail }));
	}, [initialEmail]);

	useEffect(() => {
		if (!readTokenFromQuery || typeof window === "undefined") return;

		const params = new URLSearchParams(window.location.search);
		const token = params.get("resetToken");
		if (!token) return;

		setForm((prev) => ({ ...prev, token }));
		setStep("confirm");
		onTokenFromQuery?.(token);
	}, [onTokenFromQuery, readTokenFromQuery]);

	const updateField = useCallback((field, value) => {
		setForm((prev) => ({ ...prev, [field]: value }));
		setErrors((prev) => ({ ...prev, [field]: undefined }));
	}, []);

	const resetFlow = useCallback(({ keepEmail = true } = {}) => {
		setForm((prev) => ({
			...emptyForm,
			email: keepEmail ? prev.email : "",
		}));
		setErrors({});
		setMessage("");
		setStep("request");
	}, []);

	const switchToRequest = useCallback(() => {
		setStep("request");
		setErrors({});
		setMessage("");
	}, []);

	const switchToConfirm = useCallback(() => {
		setStep("confirm");
		setErrors({});
	}, []);

	const submitRequest = useCallback(async () => {
		const email = form.email.trim();

		if (!email) {
			setErrors((prev) => ({ ...prev, email: "Email is required" }));
			dispatch(
				addSnackbar({
					snackbarMsg: "Please enter your email address.",
					snackbarSeverity: "error",
					autoHideDuration: 3000,
				})
			);
			return null;
		}

		try {
			const result = await dispatch(requestPasswordReset({ email })).unwrap();
			setMessage(result?.message || DEFAULT_RESET_MESSAGE);
			setErrors({});

			if (result?.resetToken) {
				setForm((prev) => ({ ...prev, token: result.resetToken }));
				setStep("confirm");
			}

			dispatch(
				addSnackbar({
					snackbarMsg: "Password reset requested.",
					snackbarSeverity: "success",
					autoHideDuration: 3000,
				})
			);
			return result;
		} catch (err) {
			const fieldErrors = err?.errors || {};
			const fallbackMessage = errorMessageFor(err, "Unable to request password reset");

			setErrors((prev) => ({ ...prev, ...fieldErrors }));
			dispatch(
				addSnackbar({
					snackbarMsg: fallbackMessage,
					snackbarSeverity: "error",
					autoHideDuration: 4000,
				})
			);
			throw err;
		}
	}, [dispatch, form.email]);

	const submitConfirm = useCallback(async () => {
		const token = form.token.trim();
		const newPassword = form.newPassword.trim();
		const confirmPassword = form.confirmPassword.trim();
		const nextErrors = {};

		if (!token) {
			nextErrors.token = "Reset token is required";
		}

		if (!newPassword) {
			nextErrors.newPassword = "New password is required";
		} else if (newPassword.length < MIN_PASSWORD_LENGTH) {
			nextErrors.newPassword = `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
		}

		if (newPassword !== confirmPassword) {
			nextErrors.confirmPassword = "Passwords do not match";
		}

		if (Object.keys(nextErrors).length > 0) {
			setErrors(nextErrors);
			dispatch(
				addSnackbar({
					snackbarMsg: "Please resolve password reset errors.",
					snackbarSeverity: "error",
					autoHideDuration: 3000,
				})
			);
			return null;
		}

		try {
			const result = await dispatch(confirmPasswordReset({ token, newPassword })).unwrap();
			setForm({ ...emptyForm });
			setErrors({});
			setMessage("");
			setStep("request");
			clearPasswordResetQueryParam();
			dispatch(
				addSnackbar({
					snackbarMsg: "Password reset. Please log in with your new password.",
					snackbarSeverity: "success",
					autoHideDuration: 4000,
				})
			);
			onResetConfirmed?.();
			return result;
		} catch (err) {
			const fieldErrors = err?.errors || {};
			const fallbackMessage = errorMessageFor(err, "Unable to reset password");

			setErrors((prev) => ({ ...prev, ...fieldErrors }));
			dispatch(
				addSnackbar({
					snackbarMsg: fallbackMessage,
					snackbarSeverity: "error",
					autoHideDuration: 4000,
				})
			);
			throw err;
		}
	}, [dispatch, form.confirmPassword, form.newPassword, form.token, onResetConfirmed]);

	return {
		step,
		setStep,
		form,
		errors,
		message,
		requestPending: passwordResetRequestPending,
		confirmPending: passwordResetConfirmPending,
		updateField,
		resetFlow,
		switchToRequest,
		switchToConfirm,
		submitRequest,
		submitConfirm,
	};
}

export { MIN_PASSWORD_LENGTH };
