import { Box, Paper, Stack, Typography, useTheme, Button, Divider, Chip, Slider, useMediaQuery } from "@mui/material";
import { styled, darken, lighten, getContrastRatio } from "@mui/material/styles";
import { throttle } from "lodash";
import React, { useCallback, useMemo, useState, useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import FormLabel from "@mui/material/FormLabel";
import FormControl from "@mui/material/FormControl";
import FormGroup from "@mui/material/FormGroup";
import FormControlLabel from "@mui/material/FormControlLabel";
import FormHelperText from "@mui/material/FormHelperText";
import Switch from "@mui/material/Switch";
import { modifyProfile } from "../../slices/userApiSlice";
import { setLoggedIn } from "../../slices/authSlice";
import { addSnackbar } from "../../slices/snackbarSlice";

import { scrollbarStyles } from "../scrollbarStyles";
import { updateThemeOverride, resetThemeOverrides } from "../../slices/settingsSlice";

const ItemPaper = styled(Paper)(({ theme }) => ({
	...theme.typography.body2,
	padding: theme.spacing(1),
	color: theme.palette.text.secondary,
}));

function SettingsPage() {
	const dispatch = useDispatch();
	const overrides = useSelector((state) => state.settings.overrides);
	const theme = useTheme();
	const auth = useSelector((state) => state.auth);
	const loggedInState = useSelector((state) => state.auth.loggedIn);
	const [initializedPreferences, setInitializedPreferences] = useState(false);
	const isSmUp = useMediaQuery(theme.breakpoints.up("sm"));

	const [preferencesState, setPreferencesState] = React.useState({
		allowNSFW: auth?.allowNSFW || false,
		allowAnyNotifications: auth?.allowAnyNotifications || true,
		allowPublicChatNotifications: auth?.allowPublicChatNotifications || true,
		allowPrivateChatNotifications: auth?.allowPrivateChatNotifications || true,
	});

	useEffect(() => {
		if (auth?.loggedIn) {
			setPreferencesState({
				allowNSFW: auth.allowNSFW,
				allowAnyNotifications: auth.allowAnyNotifications,
				allowPublicChatNotifications: auth.allowPublicChatNotifications,
				allowPrivateChatNotifications: auth.allowPrivateChatNotifications,
			});
			setInitializedPreferences(true);
		}
	}, [auth, loggedInState]);

	// Expose main colors
	const fields = {
		"palette.primary.main": overrides.palette?.primary?.main ?? theme.palette.primary.main,
		"palette.secondary.main": overrides.palette?.secondary?.main ?? theme.palette.secondary.main,
		"palette.error.main": overrides.palette?.error?.main ?? theme.palette.error.main,
		"palette.warning.main": overrides.palette?.warning?.main ?? theme.palette.warning.main,
		"palette.info.main": overrides.palette?.info?.main ?? theme.palette.info.main,
		"palette.background.default": overrides.palette?.background?.default ?? theme.palette.background.default,
	};

	// Derive light/dark variants
	const deriveShades = (color) => ({
		light: lighten(color, 0.2),
		dark: darken(color, 0.2),
	});

	const handleColorChange = useCallback(
		(path, value) => {
			if (path[0] === "palette" && path[1] === "background" && path[2] === "default") {
				const darker = darken(value, 0.3);
				const paperColor = getContrastRatio(value, darker) < 1.2 ? lighten(value, 0.3) : darker;
				dispatch(
					updateThemeOverride({
						palette: { background: { default: value, paper: paperColor } },
					})
				);
				return;
			}
			if (path[0] === "palette" && path[2] === "main") {
				const [, key] = path;
				const main = value;
				const { light, dark } = deriveShades(main);
				dispatch(updateThemeOverride({ palette: { [key]: { main, light, dark } } }));
				return;
			}
			const payload = {};
			let obj = payload;
			path.forEach((key, idx) => {
				if (idx === path.length - 1) obj[key] = value;
				else {
					obj[key] = {};
					obj = obj[key];
				}
			});
			dispatch(updateThemeOverride(payload));
		},
		[dispatch]
	);

	const throttledHandleColorChange = useMemo(() => throttle(handleColorChange, 150), [handleColorChange]);

	const handleNumberChange = useCallback(
		(path, value) => {
			const num = Number(value);
			const payload = {};
			let obj = payload;
			path.forEach((key, idx) => {
				if (idx === path.length - 1) obj[key] = num;
				else {
					obj[key] = {};
					obj = obj[key];
				}
			});
			dispatch(updateThemeOverride(payload));
		},
		[dispatch]
	);

	const handleReset = () => dispatch(resetThemeOverrides());

	const borderRadius = overrides.shape?.borderRadius ?? theme.shape.borderRadius;
	const spacingMultiplier = overrides.shape?.spacingMultiplier ?? 1;

	const [localBorder, setLocalBorder] = useState(borderRadius);
	const [localSpacing, setLocalSpacing] = useState(spacingMultiplier);

	useEffect(() => setLocalBorder(borderRadius), [borderRadius]);
	useEffect(() => setLocalSpacing(spacingMultiplier), [spacingMultiplier]);

	const handlePreferencesChange = async (event) => {
		let newPreferences = {
			...preferencesState,
			[event.target.name]: event.target.checked,
		};
		if (event.target.name === "allowAnyNotifications" && !event.target.checked) {
			newPreferences = {
				...newPreferences,
				allowPublicChatNotifications: false,
				allowPrivateChatNotifications: false,
			};
		}
		setPreferencesState({
			...newPreferences,
		});
		setInitializedPreferences(true);
	};

	const handleSavePreferences = async () => {
		console.log("Saving preferences:", preferencesState);
		const formData = new FormData();

		formData.append("allowNSFW", String(preferencesState.allowNSFW));
		formData.append("allowAnyNotifications", String(preferencesState.allowAnyNotifications));
		formData.append("allowPublicChatNotifications", String(preferencesState.allowPublicChatNotifications));
		formData.append("allowPrivateChatNotifications", String(preferencesState.allowPrivateChatNotifications));

		dispatch(modifyProfile({ formData, authToken: auth.authToken }))
			.unwrap()
			.then(({ profile: u }) => {
				const full = u;

				dispatch(
					setLoggedIn({
						allowNSFW: full.allowNSFW,
						allowAnyNotifications: full.allowAnyNotifications,
						allowPublicChatNotifications: full.allowPublicChatNotifications,
						allowPrivateChatNotifications: full.allowPrivateChatNotifications,
					})
				);

				dispatch(
					addSnackbar({
						snackbarMsg: "Preferences updated",
						snackbarSeverity: "success",
						autoHideDuration: 1500,
					})
				);
			})
			.catch((err) => {
				if (err && err.error) {
					dispatch(
						addSnackbar({
							snackbarMsg: err.error,
							snackbarSeverity: "error",
							autoHideDuration: 2000,
						})
					);
				} else {
					dispatch(
						addSnackbar({
							snackbarMsg: "Error modifying preferences",
							snackbarSeverity: "error",
							autoHideDuration: 2000,
						})
					);
				}
			});
	};

	return (
		<Stack
			direction={isSmUp ? "row" : "column"}
			spacing={2}
			sx={{
				flexGrow: 1,
				overflowY: "auto",
				overflowX: "auto",
				display: "flex",
				...scrollbarStyles,
			}}>
			<ItemPaper sx={{ p: 1, backgroundColor: theme.palette.background.paper, flexGrow: isSmUp ? 1 : 0 }}>
				<Stack spacing={2} sx={{ display: "flex" }}>
					<ItemPaper
						sx={{
							flexGrow: 1,
							flexDirection: { xs: "column", sm: "row" },
						}}>
						<Stack spacing={2} flexDirection={{ xs: "column", sm: "row" }} sx={{ display: "flex" }}>
							<Typography
								sx={{
									flexGrow: 1,
								}}
								textAlign={"center"}
								variant="h6">
								Personalize
							</Typography>
							<Button variant="contained" onClick={handleReset} sx={{ flexShrink: 1 }} size="small" style={{ margin: 0 }}>
								Reset
							</Button>
						</Stack>
					</ItemPaper>
					<Divider flexItem />
					{Object.entries(fields).map(([key, val]) => {
						const parts = key.split(".");
						const label = parts.slice(-2)[0];
						return (
							<Stack key={key} direction={{ xs: "column", sm: "row" }} spacing={1} alignItems={{ xs: "flex-start", sm: "center" }}>
								<Typography
									sx={{
										width: { xs: "100%", sm: 120 },
										textTransform: "capitalize",
									}}>
									{label}
								</Typography>
								<Box sx={{ width: 40 }}>
									<input
										type="color"
										value={val}
										style={{ width: "100%", height: 40 }}
										onChange={(e) => throttledHandleColorChange(parts, e.target.value)}
										onMouseUp={(e) => handleColorChange(parts, e.target.value)}
									/>
								</Box>
							</Stack>
						);
					})}
					<Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems={{ xs: "flex-start", sm: "center" }}>
						<Typography
							sx={{
								minWidth: 120,
								textTransform: "capitalize",
								flexShrink: 0,
							}}>
							Rounding
						</Typography>
						<Slider
							sx={{ width: "100%" }}
							min={0}
							max={50}
							step={1}
							value={localBorder}
							onChange={(e, val) => setLocalBorder(val)}
							onChangeCommitted={(e, val) => handleNumberChange(["shape", "borderRadius"], val)}
							valueLabelDisplay="auto"
						/>
					</Stack>

					<Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems={{ xs: "flex-start", sm: "center" }}>
						<Typography
							sx={{
								minWidth: 120,
								textTransform: "capitalize",
								flexShrink: 0,
							}}>
							Spacing
						</Typography>
						<Slider
							sx={{ flexGrow: 1 }}
							min={0.25}
							max={2}
							step={0.25}
							value={localSpacing}
							onChange={(e, val) => setLocalSpacing(val)}
							onChangeCommitted={(e, val) => handleNumberChange(["shape", "spacingMultiplier"], val)}
							valueLabelDisplay="auto"
						/>
					</Stack>
				</Stack>
			</ItemPaper>
			{loggedInState && (
				<PreferencesSection
					preferencesState={preferencesState}
					handlePreferencesChange={handlePreferencesChange}
					handleSavePreferences={handleSavePreferences}
					initializedPreferences={initializedPreferences}
				/>
			)}
		</Stack>
	);
}

function PreferencesSection({ preferencesState, handlePreferencesChange, handleSavePreferences, initializedPreferences }) {
	const theme = useTheme();

	return (
		<ItemPaper sx={{ p: 1, backgroundColor: theme.palette.background.paper, flexGrow: 1 }}>
			<Stack spacing={2} sx={{ display: "flex" }}>
				<ItemPaper
					sx={{
						flexGrow: 1,
						flexDirection: { xs: "column", sm: "row" },
					}}>
					<Stack spacing={2} flexDirection={{ xs: "column", sm: "row" }} sx={{ display: "flex" }}>
						<Typography
							sx={{
								flexGrow: 1,
							}}
							textAlign={"center"}
							variant="h6">
							Preferences
						</Typography>
					</Stack>
				</ItemPaper>
				<Divider flexItem />
				<FormControl component="fieldset" variant="standard">
					<FormLabel component="legend">Content</FormLabel>
					<FormGroup>
						<FormControlLabel
							control={
								<Switch
									sx={{ opacity: initializedPreferences ? 1 : 0.0, transition: "opacity 1.0s" }}
									checked={preferencesState.allowNSFW}
									onChange={handlePreferencesChange}
									name="allowNSFW"
								/>
							}
							label="Allow NSFW"
						/>
					</FormGroup>
					<FormLabel component="legend">Notifications</FormLabel>
					<FormGroup>
						<FormControlLabel
							control={
								<Switch
									sx={{ opacity: initializedPreferences ? 1 : 0.0, transition: "opacity 1.0s" }}
									checked={preferencesState.allowAnyNotifications}
									onChange={handlePreferencesChange}
									name="allowAnyNotifications"
								/>
							}
							label="Any Notifications"
						/>
						<FormControlLabel
							disabled={!preferencesState.allowAnyNotifications}
							control={
								<Switch
									sx={{ opacity: initializedPreferences ? 1 : 0.0, transition: "opacity 1.0s" }}
									checked={preferencesState.allowPublicChatNotifications}
									onChange={handlePreferencesChange}
									name="allowPublicChatNotifications"
								/>
							}
							label="Messages (public)"
						/>
						<FormControlLabel
							disabled={!preferencesState.allowAnyNotifications}
							control={
								<Switch
									sx={{ opacity: initializedPreferences ? 1 : 0.0, transition: "opacity 1.0s" }}
									checked={preferencesState.allowPrivateChatNotifications}
									onChange={handlePreferencesChange}
									name="allowPrivateChatNotifications"
								/>
							}
							label="Messages (private)"
						/>
					</FormGroup>
				</FormControl>
				<Button variant="contained" onClick={handleSavePreferences}>
					Save Preferences
				</Button>
			</Stack>
		</ItemPaper>
	);
}

export default SettingsPage;
