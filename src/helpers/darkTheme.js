import { createTheme, ThemeProvider } from "@mui/material/styles";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useEffect, useState } from "react";

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
  spacingMultFull: 1,
  spacingMult: (factor) => 1,
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
  const [darkTheme, setDarkTheme] = useState(darkThemeBase);

  function modifyTheme(newStyles) {
    return createTheme({
      ...darkTheme,
      ...newStyles,
    });
  }

  useEffect(() => {
    const spacings = [8, 6];
    const chosenSpacing = spacings[Number(!spacingMatch)];
    const spacingMult = chosenSpacing / Math.max(...spacings);

    const newSpacingStyles = {
      spacing: chosenSpacing,
      spacingMultFull: spacingMult,
      spacingMult: (factor) => (1 - spacingMult) / factor + spacingMult,
    };

    setDarkTheme(modifyTheme(newSpacingStyles));

    return () => {
      return;
    };
  }, [spacingMatch]);

  return darkTheme;
}

export default useDarkTheme;
