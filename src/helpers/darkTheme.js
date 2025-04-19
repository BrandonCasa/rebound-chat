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
	spacing: 8,
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
	const spacingMatch = useMediaQuery(darkThemeBase.breakpoints.up("sm"));

	const darkTheme = useMemo(() => {
		const [large, small] = [8, 6];
		const chosen = spacingMatch ? large : small;
		const spacingMult = chosen / Math.max(large, small);

		return createTheme(darkThemeBase, {
			spacing: chosen,
			// if you really need these helpers on the theme
			spacingMultFull: spacingMult,
			spacingMult: (factor) => (1 - spacingMult) / factor + spacingMult,
		});
	}, [spacingMatch]);

	const overrides = useSelector((state) => state.settings.overrides);

	const themeWithOverrides = useMemo(() => createTheme(darkTheme, overrides), [darkTheme, overrides]);

	return themeWithOverrides;
}

export default useDarkTheme;
