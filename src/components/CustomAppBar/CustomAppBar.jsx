import { Box } from "@mui/material";
import { useTheme } from "@mui/material/styles";

import AccountMenu from "./AccountMenu";
import AppBarContent from "./AppBarContent";
import DrawerMenu from "./DrawerMenu";
import MainContent from "./MainContent";

function CustomAppBar({
  drawerWidth,
  iconWidth,
  drawerOpen,
  setDrawerOpen,
  handleIconClick,
  loggedInState,
  anchorEl,
  open,
  handleClose,
  handleLogout,
  children,
}) {
  const theme = useTheme();

  return (
    <Box
      sx={{
        display: "flex",
        height: "100%",
        width: "100%",
        position: "fixed",
        top: 0,
      }}
    >
      <AppBarContent
        handleIconClick={handleIconClick}
        iconWidth={iconWidth}
        drawerWidth={drawerWidth}
        loggedInState={loggedInState}
      />
      <AccountMenu
        anchorEl={anchorEl}
        open={open}
        handleClose={handleClose}
        handleLogout={handleLogout}
        theme={theme}
      />
      <DrawerMenu
        drawerWidth={drawerWidth}
        iconWidth={iconWidth}
        drawerOpen={drawerOpen}
        setDrawerOpen={setDrawerOpen}
        theme={theme}
      />
      <MainContent
        drawerWidth={drawerWidth}
        drawerOpen={drawerOpen}
        theme={theme}
        iconWidth={iconWidth}
        setDrawerOpen={setDrawerOpen}
      >
        {children}
      </MainContent>
    </Box>
  );
}

export default CustomAppBar;
