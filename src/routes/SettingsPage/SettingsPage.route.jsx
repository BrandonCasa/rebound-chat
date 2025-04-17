import React from "react";
import { Box, Paper, Stack, Typography, useTheme, Button, Divider, Chip } from "@mui/material";
import { styled, darken, lighten, getContrastRatio } from "@mui/material/styles";
import { useDispatch, useSelector } from "react-redux";
import { updateThemeOverride, resetThemeOverrides } from "slices/settingsSlice";

const ItemPaper = styled(Paper)(({ theme }) => ({
	...theme.typography.body2,
	padding: theme.spacing(1),
	textAlign: "center",
	color: theme.palette.text.secondary,
}));

function SettingsPage() {
	const dispatch = useDispatch();
	const overrides = useSelector((state) => state.settings.overrides);
	const theme = useTheme();

	const primaryColor = overrides.palette?.primary?.main || theme.palette.primary.main;
	const secondaryColor = overrides.palette?.secondary?.main || theme.palette.secondary.main;
	const backgroundDefault = overrides.palette?.background?.default || theme.palette.background.default;
	const backgroundPaper = overrides.palette?.background?.paper || theme.palette.background.paper;
	const textPrimary = overrides.palette?.text?.primary || theme.palette.text.primary;
	const textSecondary = overrides.palette?.text?.secondary || theme.palette.text.secondary;

	const handleColorChange = (path, value) => {
		// if changing background.default, also compute & set background.paper
		if (path[0] === "palette" && path[1] === "background" && path[2] === "default") {
			// compute 30% darker
			const darker = darken(value, 0.3);
			// if contrast too low, flip to lighter
			const paperColor = getContrastRatio(value, darker) < 1.2 ? lighten(value, 0.3) : darker;

			// dispatch one action that overrides both default & paper
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

		// otherwise just override the single path
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

	const handleReset = () => {
		dispatch(resetThemeOverrides());
	};

	return (
		<Box sx={{ display: "flex", justifyContent: "center", flexGrow: 1, overflow: "hidden", flexDirection: "column" }}>
			<Stack spacing={2} sx={{ height: "100%", width: "100%" }}>
				<ItemPaper>
					<Typography variant="h4">Settings</Typography>
				</ItemPaper>

				<Divider sx={{ "&::after": { borderWidth: "3px" }, "&::before": { borderWidth: "3px" }, m: 0 }} variant="middle" textAlign="left">
					<Chip color="secondary" label="Customization" />
				</Divider>

				<Paper sx={{ display: "flex", flexDirection: "column", p: 2, backgroundColor: backgroundPaper }}>
					<Stack spacing={3}>
						<Stack direction="row" spacing={2} alignItems="center">
							<Typography>Primary Color</Typography>
							<input type="color" value={primaryColor} onChange={(e) => handleColorChange(["palette", "primary", "main"], e.target.value)} />
						</Stack>

						<Stack direction="row" spacing={2} alignItems="center">
							<Typography>Secondary Color</Typography>
							<input type="color" value={secondaryColor} onChange={(e) => handleColorChange(["palette", "secondary", "main"], e.target.value)} />
						</Stack>

						<Stack direction="row" spacing={2} alignItems="center">
							<Typography>Background Color</Typography>
							<input type="color" value={backgroundDefault} onChange={(e) => handleColorChange(["palette", "background", "default"], e.target.value)} />
						</Stack>

						<Stack direction="row" spacing={2} alignItems="center">
							<Typography>Text 1st Color</Typography>
							<input type="color" value={textPrimary} onChange={(e) => handleColorChange(["palette", "text", "primary"], e.target.value)} />
						</Stack>

						<Stack direction="row" spacing={2} alignItems="center">
							<Typography>Text 2nd Color</Typography>
							<input type="color" value={textSecondary} onChange={(e) => handleColorChange(["palette", "text", "secondary"], e.target.value)} />
						</Stack>
					</Stack>

					<Box sx={{ mt: 4 }}>
						<Button variant="outlined" onClick={handleReset}>
							Reset to Defaults
						</Button>
					</Box>
				</Paper>
			</Stack>
		</Box>
	);
}

export default SettingsPage;
