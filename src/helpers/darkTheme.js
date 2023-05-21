import { createTheme, ThemeProvider } from "@mui/material/styles";

const darkTheme = createTheme({
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
          '&:-webkit-autofill': {
            transitionDelay: '999999s',
            transitionProperty: 'background-color, color',
          },
        },
      }
    },
    MuiDrawer: {
      styleOverrides: {
        root: {
          overflow: "hidden",
        },
        paper: {
          overflow: "hidden",
        }
      }
    }
  },
});

export default darkTheme;