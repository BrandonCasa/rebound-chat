import { useCallback, useEffect, useMemo, useState } from "react";
import { useDispatch } from "react-redux";
import { addSnackbar } from "../../slices/snackbarSlice";

/**
 * Placeholder API helpers
 * Replace these with your real API calls (fetch/axios/etc).
 */

async function fetchDeviceSessionsApi() {
	// fake latency
	await new Promise((r) => setTimeout(r, 400));

	// Example mock data; align this shape with your backend
	return [
		{
			id: "current",
			userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0",
			deviceName: "Windows · Chrome",
			location: "Mamaroneck, New York, United States",
			ipAddress: "203.0.113.42",
			lastActive: "2025-11-22T15:30:00.000Z",
			isCurrent: true,
		},
		{
			id: "ios-1",
			userAgent: "Discord iOS/2019.4.1 (iPhone16,2; iOS 18.1.1)",
			deviceName: "iOS · Discord",
			location: "Mamaroneck, New York, United States",
			ipAddress: "198.51.100.10",
			lastActive: "2025-11-22T15:00:00.000Z",
			isCurrent: false,
		},
		{
			id: "mac-1",
			userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15",
			deviceName: "macOS · Safari",
			location: "Mamaroneck, New York, United States",
			ipAddress: "192.0.2.15",
			lastActive: "2025-11-22T08:10:00.000Z",
			isCurrent: false,
		},
	];
}

async function revokeDeviceSessionApi(deviceId) {
	console.log("[mock] revoke device", deviceId);
	await new Promise((r) => setTimeout(r, 250));
}

async function revokeAllExceptCurrentApi() {
	console.log("[mock] revoke all devices except current");
	await new Promise((r) => setTimeout(r, 400));
}

/**
 * Hook
 */

export default function useDeviceSessions() {
	const dispatch = useDispatch();
	const [sessions, setSessions] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(null);

	const loadSessions = useCallback(async () => {
		try {
			setLoading(true);
			setError(null);
			const data = await fetchDeviceSessionsApi();
			setSessions(data);
		} catch (err) {
			console.error(err);
			setError("Failed to load devices");
			dispatch(
				addSnackbar({
					snackbarMsg: "Failed to load devices",
					snackbarSeverity: "error",
					autoHideDuration: 4000,
				})
			);
		} finally {
			setLoading(false);
		}
	}, [dispatch]);

	useEffect(() => {
		loadSessions();
	}, [loadSessions]);

	const handleRevokeSession = useCallback(
		async (deviceId) => {
			try {
				setLoading(true);
				await revokeDeviceSessionApi(deviceId);
				setSessions((prev) => prev.filter((s) => s.id !== deviceId));

				dispatch(
					addSnackbar({
						snackbarMsg: "Device logged out",
						snackbarSeverity: "success",
						autoHideDuration: 3000,
					})
				);
			} catch (err) {
				console.error(err);
				setError("Failed to revoke device");
				dispatch(
					addSnackbar({
						snackbarMsg: "Failed to revoke device",
						snackbarSeverity: "error",
						autoHideDuration: 4000,
					})
				);
			} finally {
				setLoading(false);
			}
		},
		[dispatch]
	);

	const handleRevokeAllExceptCurrent = useCallback(async () => {
		try {
			setLoading(true);
			await revokeAllExceptCurrentApi();
			setSessions((prev) => prev.filter((s) => s.isCurrent));

			dispatch(
				addSnackbar({
					snackbarMsg: "Logged out of all other devices",
					snackbarSeverity: "warning",
					autoHideDuration: 4000,
				})
			);
		} catch (err) {
			console.error(err);
			setError("Failed to revoke devices");
			dispatch(
				addSnackbar({
					snackbarMsg: "Failed to revoke devices",
					snackbarSeverity: "error",
					autoHideDuration: 4000,
				})
			);
		} finally {
			setLoading(false);
		}
	}, [dispatch]);

	const value = useMemo(() => {
		const current = sessions.find((s) => s.isCurrent) || null;
		const others = sessions.filter((s) => !s.isCurrent);

		return {
			sessions,
			currentSession: current,
			otherSessions: others,
			hasOtherSessions: others.length > 0,
			loading,
			error,
			handleRevokeSession,
			handleRevokeAllExceptCurrent,
			refreshSessions: loadSessions,
		};
	}, [sessions, loading, error, handleRevokeSession, handleRevokeAllExceptCurrent, loadSessions]);

	return value;
}
