import AppBarContent from "./AppBarContent";
import AccountMenu from "./AccountMenu";
import DrawerMenu from "./DrawerMenu";
import MainContent from "./MainContent";
import useCustomAppBar from "components/CustomAppBar/useCustomAppBar";
import useWindowDimensions from "helpers/useWindowDimensions";
import { useTheme } from "@mui/material/styles";
import { Box } from "@mui/material";

function CustomAppBar(props) {
  const { height, width } = useWindowDimensions();
  const theme = useTheme();
  const { drawerWidth, iconWidth, drawerOpen, setDrawerOpen, handleIconClick, loggedInState, anchorEl, open, handleClose, handleLogout } = useCustomAppBar(width);

  return (
    <Box sx={{ display: "flex", height: "100%", width: "100%", position: "fixed", top: 0 }}>
      <AppBarContent handleIconClick={handleIconClick} iconWidth={iconWidth} drawerWidth={drawerWidth} loggedInState={loggedInState} />
      <AccountMenu anchorEl={anchorEl} open={open} handleClose={handleClose} handleLogout={handleLogout} theme={theme} />
      <DrawerMenu drawerWidth={drawerWidth} iconWidth={iconWidth} drawerOpen={drawerOpen} setDrawerOpen={setDrawerOpen} theme={theme} />
      <MainContent drawerWidth={drawerWidth} drawerOpen={drawerOpen} theme={theme} iconWidth={iconWidth} setDrawerOpen={setDrawerOpen} children={props.children} />
    </Box>
  );
}

export default CustomAppBar;
