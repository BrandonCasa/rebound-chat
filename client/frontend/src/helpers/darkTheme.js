import { createTheme } from "@mui/material/styles";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useMemo } from "react";
import { useSelector } from "react-redux";

const darkThemeBase = createTheme({
	palette: {
		type: "dark",
		text: {
			primary: "#c8c8c8",
			secondary: "#a3a3a3",
		},
		primary: {
			main: "#b53f3f",
			light: "#ec6f6a",
			dark: "#7f0418",
		},
		secondary: {
			main: "#0099f5",
		},
		background: {
			paper: "#383838",
			default: "#262626",
		},
		error: {
			main: "#ab2424",
		},
		warning: {
			main: "#c96800",
		},
		info: {
			main: "#21f3dc",
		},
	},
	shape: {
		borderRadius: 8,
	},
	components: {
		MuiInputBase: {
			styleOverrides: {
				input: {
					"&:-webkit-autofill": {
						transitionDelay: "999999s",
						transitionProperty: "background-color, color",
					},
				},
			},
		},
		MuiDrawer: {
			styleOverrides: {
				root: {
					overflow: "hidden",
				},
				paper: {
					overflow: "hidden",
				},
			},
		},
	},
});

function useDarkTheme() {
	const overrides = useSelector((state) => state.settings.overrides);
	const isDesktop = useMediaQuery(darkThemeBase.breakpoints.up("sm"));
	const defaultMultiplier = isDesktop ? 8 : 4;

	const spacingMultiplier = (overrides.shape?.spacingMultiplier || 1) * defaultMultiplier;

	const darkTheme = useMemo(
		() =>
			createTheme(darkThemeBase, {
				spacing: (factor) => `${spacingMultiplier * factor}px`,
			}),
		[spacingMultiplier]
	);

	const themeWithOverrides = useMemo(() => createTheme(darkTheme, overrides), [darkTheme, overrides]);

	return themeWithOverrides;
}

export default useDarkTheme;
