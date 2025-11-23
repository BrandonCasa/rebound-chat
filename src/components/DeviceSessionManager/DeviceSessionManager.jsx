import React from "react";
import {
	Box,
	Card,
	CardContent,
	CardHeader,
	Divider,
	IconButton,
	Stack,
	Tooltip,
	Typography,
	Button,
	Chip,
	useTheme,
	useMediaQuery,
	Skeleton,
} from "@mui/material";

import DevicesOtherRoundedIcon from "@mui/icons-material/DevicesOtherRounded";
import LogoutRoundedIcon from "@mui/icons-material/LogoutRounded";
import SecurityRoundedIcon from "@mui/icons-material/SecurityRounded";
import LocationOnOutlinedIcon from "@mui/icons-material/LocationOnOutlined";
import AccessTimeRoundedIcon from "@mui/icons-material/AccessTimeRounded";

import useDeviceSessions from "./useDeviceSessions";

const MASK = "••••••••••";

function formatLastActive(dateString) {
	const date = new Date(dateString);
	if (Number.isNaN(date.getTime())) return dateString;

	return date.toLocaleString(undefined, {
		month: "short",
		day: "numeric",
		hour: "numeric",
		minute: "2-digit",
	});
}

export default function DeviceSessionsPanel(props) {
	const { sx, ...rest } = props;
	const theme = useTheme();
	const isSmUp = useMediaQuery(theme.breakpoints.up("sm"));

	const { currentSession, otherSessions, hasOtherSessions, loading, error, handleRevokeSession, handleRevokeAllExceptCurrent } = useDeviceSessions();

	return (
		<Card
			elevation={0}
			sx={{
				width: "100%",
				borderRadius: 2,
				border: `1px solid ${theme.palette.divider}`,
				backgroundColor: theme.palette.background.paper,
				...sx,
			}}
			{...rest}>
			<CardHeader
				avatar={
					<Box
						sx={{
							width: 40,
							height: 40,
							borderRadius: 1,
							display: "flex",
							alignItems: "center",
							justifyContent: "center",
							bgcolor: theme.palette.primary.main,
							color: theme.palette.primary.contrastText,
						}}>
						<DevicesOtherRoundedIcon fontSize="small" />
					</Box>
				}
				title={
					<Typography variant="h6" sx={{ fontWeight: 600 }}>
						Logged-in devices
					</Typography>
				}
				subheader={
					<Typography variant="body2" color="text.secondary">
						Manage where your account is signed in and revoke their login.
					</Typography>
				}
				sx={{ pb: 0 }}
			/>

			<Divider flexItem />

			{/* Current device */}
			<Box sx={{ mt: 1 }}>
				<Stack direction="row" alignItems="center" justifyContent="space-between" spacing={2} sx={{ mx: 1 }}>
					<Stack direction="row" spacing={3} alignItems="center">
						<Typography variant="subtitle2" sx={{ textTransform: "uppercase", letterSpacing: 0.6 }} color="text.secondary">
							Current device
						</Typography>
						<Chip
							size="small"
							icon={<SecurityRoundedIcon color="#12a4ff" sx={{ fontSize: 16, color: "#12a4ff" }} />}
							label="Protected"
							sx={{
								fontSize: 11,
								borderRadius: 999,
							}}
						/>
					</Stack>
				</Stack>

				<Box sx={{ padding: 1 }}>
					{loading && !currentSession ? (
						<DeviceRowSkeleton />
					) : currentSession ? (
						<DeviceRow
							session={currentSession}
							isCurrent
							compact={!isSmUp}
							// no revoke for current device
						/>
					) : (
						<Typography variant="body2" color="text.secondary">
							No active current device detected.
						</Typography>
					)}
				</Box>
			</Box>

			<Divider flexItem />

			{/* Other devices */}
			<Box sx={{ mt: 1 }}>
				<Stack direction={isSmUp ? "row" : "column"} alignItems={isSmUp ? "center" : "flex-start"} justifyContent="space-between" spacing={2} sx={{ mx: 1 }}>
					<Typography variant="subtitle2" sx={{ textTransform: "uppercase", letterSpacing: 0.6 }} color="text.secondary">
						Other devices
					</Typography>

					<Button
						variant="contained"
						sx={{ background: "#c94b4b" }}
						size="small"
						startIcon={<LogoutRoundedIcon />}
						onClick={handleRevokeAllExceptCurrent}
						disabled={!hasOtherSessions || loading}>
						Logout All
					</Button>
				</Stack>

				<Box sx={{ padding: 1 }}>
					{loading && otherSessions.length === 0 ? (
						<Stack spacing={1.5}>
							<DeviceRowSkeleton />
							<DeviceRowSkeleton />
						</Stack>
					) : otherSessions.length === 0 ? (
						<Typography variant="body2" color="text.secondary">
							You’re only signed in on this device.
						</Typography>
					) : (
						<Stack spacing={1.5}>
							{otherSessions.map((session) => (
								<DeviceRow
									key={session.id}
									session={session}
									isCurrent={false}
									compact={!isSmUp}
									disabled={loading}
									onRevoke={() => handleRevokeSession(session.id)}
								/>
							))}
						</Stack>
					)}
				</Box>
			</Box>
		</Card>
	);
}

/**
 * Subcomponents
 */

function DeviceRow({ session, isCurrent, onRevoke, compact = false, disabled = false }) {
	const theme = useTheme();

	return (
		<Box
			sx={{
				px: 2,
				py: 1.25,
				borderRadius: 2,
				border: `1px solid ${theme.palette.divider}`,
				display: "flex",
				flexDirection: compact ? "column" : "row",
				alignItems: compact ? "flex-start" : "center",
				justifyContent: "space-between",
				gap: 1.5,
				bgcolor: (t) => (isCurrent ? t.palette.action.disabledBackground : t.palette.action.hover),
			}}>
			<Stack spacing={0.75}>
				<Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
					{session.deviceName}
				</Typography>

				<Typography variant="caption" color="text.secondary">
					{session.userAgent}
				</Typography>

				<Stack direction="row" flexWrap="wrap" spacing={1.5} rowGap={0.5} sx={{ mt: 0.5 }}>
					<Stack direction="row" spacing={0.5} alignItems="center">
						<LocationOnOutlinedIcon sx={{ fontSize: 16 }} />
						<Typography variant="body2" color="text.secondary">
							{session.location}
						</Typography>
					</Stack>

					<Stack direction="row" spacing={0.5} alignItems="center">
						<AccessTimeRoundedIcon sx={{ fontSize: 16 }} />
						<Typography variant="body2" color="text.secondary">
							Last active {formatLastActive(session.lastActive)}
						</Typography>
					</Stack>

					<Tooltip title={session.ipAddress} arrow placement="top" describeChild>
						<Typography
							variant="body2"
							color="text.secondary"
							sx={{
								fontFamily: "monospace",
								cursor: "help",
								borderRadius: 1,
								px: 0.75,
								py: 0.25,
								border: `1px dashed ${theme.palette.divider}`,
							}}>
							IP: {MASK}
						</Typography>
					</Tooltip>
				</Stack>
			</Stack>

			<Stack direction="row" alignItems="center" justifyContent={compact ? "flex-start" : "flex-end"} spacing={1}>
				{isCurrent && (
					<Chip
						size="small"
						label="This device"
						sx={{
							fontSize: 11,
							borderRadius: 999,
						}}
					/>
				)}

				{!isCurrent && onRevoke && (
					<Tooltip title="Log out from this device" arrow>
						<span>
							<Button variant="contained" size="small" onClick={onRevoke} disabled={disabled} sx={{ padding: 1.5, minWidth: 0, background: "#a62929" }}>
								<LogoutRoundedIcon fontSize="small" />
							</Button>
						</span>
					</Tooltip>
				)}
			</Stack>
		</Box>
	);
}

function DeviceRowSkeleton() {
	const theme = useTheme();
	return (
		<Box
			sx={{
				px: 2,
				py: 1.25,
				borderRadius: 2,
				border: `1px solid ${theme.palette.divider}`,
			}}>
			<Stack spacing={1}>
				<Skeleton variant="text" width="40%" />
				<Skeleton variant="text" width="60%" />
				<Stack direction="row" spacing={2}>
					<Skeleton variant="text" width={120} />
					<Skeleton variant="text" width={160} />
					<Skeleton variant="rectangular" width={80} height={22} />
				</Stack>
			</Stack>
		</Box>
	);
}
