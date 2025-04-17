import React from "react";
import { Box, Paper, Stack, Typography, useTheme, Button, Divider, Chip, TextField, Container } from "@mui/material";
import { styled, darken, lighten, getContrastRatio } from "@mui/material/styles";
import { useDispatch, useSelector } from "react-redux";
import { updateThemeOverride, resetThemeOverrides } from "slices/settingsSlice";
import { scrollbarStyles } from "routes/LandingPage/utils/scrollbarStyles";

const ItemPaper = styled(Paper)(({ theme }) => ({
	...theme.typography.body2,
	padding: theme.spacing(1),
	textAlign: "center",
	flexDirection: "row",
	display: "flex",
	color: theme.palette.text.secondary,
}));

function SettingsPage() {
	const dispatch = useDispatch();
	const overrides = useSelector((state) => state.settings.overrides);
	const theme = useTheme();

	// Expose only main colors; derive light/dark and paper automatically
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

	const handleColorChange = (path, value) => {
		// Special case: background.default => auto-calc background.paper
		if (path[0] === "palette" && path[1] === "background" && path[2] === "default") {
			const darker = darken(value, 0.3);
			const paperColor = getContrastRatio(value, darker) < 1.2 ? lighten(value, 0.3) : darker;
			dispatch(
				updateThemeOverride({
					palette: {
						background: {
							default: value,
							paper: paperColor,
						},
					},
				})
			);
			return;
		}

		// Main color changes: derive light/dark
		if (path[0] === "palette" && path[2] === "main") {
			const [_, key] = path; // e.g. ['palette','primary','main'] => key='primary'
			const main = value;
			const { light, dark } = deriveShades(main);
			dispatch(
				updateThemeOverride({
					palette: {
						[key]: { main, light, dark },
					},
				})
			);
			return;
		}

		// Fallback: generic override
		const payload = {};
		let obj = payload;
		path.forEach((key, idx) => {
			if (idx === path.length - 1) {
				obj[key] = value;
			} else {
				obj[key] = {};
				obj = obj[key];
			}
		});
		dispatch(updateThemeOverride(payload));
	};

	const handleNumberChange = (path, value) => {
		const num = Number(value);
		const payload = {};
		let obj = payload;
		path.forEach((key, idx) => {
			if (idx === path.length - 1) {
				obj[key] = num;
			} else {
				obj[key] = {};
				obj = obj[key];
			}
		});
		dispatch(updateThemeOverride(payload));
	};

	const handleReset = () => dispatch(resetThemeOverrides());

	// Shape & spacing overrides
	const borderRadius = overrides.shape?.borderRadius ?? theme.shape.borderRadius;

	return (
		<Box sx={{ display: "flex", justifyContent: "center", flexGrow: 1, overflow: "hidden", flexDirection: "column" }}>
			<ItemPaper>
				<Typography variant="h4" sx={{ flexGrow: 1 }}>
					Settings
				</Typography>
				<Button variant="outlined" onClick={handleReset} sx={{ marginLeft: "auto" }}>
					Reset to Defaults
				</Button>
			</ItemPaper>
			<Stack marginTop={2} spacing={2} sx={{ height: "100%", width: "100%", overflow: "auto", ...scrollbarStyles }}>
				<div>
					<Divider variant="middle" textAlign="left" sx={{ m: 0, "&::before, &::after": { borderWidth: 3 } }}>
						<Chip color="secondary" label="Palette Colors" />
					</Divider>
				</div>

				<Paper sx={{ p: 2, backgroundColor: theme.palette.background.paper }}>
					<Stack spacing={3}>
						{Object.entries(fields).map(([key, val]) => {
							const parts = key.split(".");
							const label = parts.slice(-2)[0];
							return (
								<Stack key={key} direction="row" spacing={2} alignItems="center">
									<Typography sx={{ width: 120, textTransform: "capitalize" }}>{label}</Typography>
									<input type="color" value={val} onChange={(e) => handleColorChange(parts, e.target.value)} />
								</Stack>
							);
						})}
					</Stack>
				</Paper>

				<div>
					<Divider variant="middle" textAlign="left" sx={{ m: 0, "&::before, &::after": { borderWidth: 3 } }}>
						<Chip color="secondary" label="Shape & Spacing" />
					</Divider>
				</div>

				<Paper sx={{ p: 2, backgroundColor: theme.palette.background.paper }}>
					<Stack spacing={3}>
						<Stack direction="row" spacing={2} alignItems="center">
							<Typography sx={{ maxWidth: 160 }}>Border Radius</Typography>
							<TextField
								type="number"
								inputProps={{ min: 0 }}
								value={borderRadius}
								onChange={(e) => handleNumberChange(["shape", "borderRadius"], e.target.value)}
								size="small"
							/>
						</Stack>
					</Stack>
				</Paper>
			</Stack>
		</Box>
	);
}

export default SettingsPage;
