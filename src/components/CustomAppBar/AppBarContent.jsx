import { AppBar, Toolbar, Typography, IconButton, Avatar } from "@mui/material";
import * as Icons from "@mui/icons-material";

const AppBarContent = ({ handleIconClick, iconWidth, drawerWidth, loggedInState }) => (
  <AppBar
    position="fixed"
    sx={{
      width: `calc(100% - ${drawerWidth}px)`,
      ml: `${drawerWidth}px`,
      boxShadow: "none",
    }}
  >
    <Toolbar
      variant="dense"
      sx={{
        height: drawerWidth,
        minHeight: drawerWidth,
      }}
    >
      <Typography variant="h6" noWrap component="div" sx={{ flexGrow: 1 }}>
        Rebound
      </Typography>
      <IconButton color="secondary" sx={{ height: `${iconWidth}px`, height: drawerWidth }} onClick={handleIconClick}>
        <Icons.AccountCircleRounded sx={{ height: drawerWidth - 16, width: drawerWidth - 16, display: loggedInState ? "none" : "inherit" }} />
        <Avatar
          alt="Remy Sharp"
          src="https://mui.com/static/images/avatar/3.jpg"
          sx={{ height: drawerWidth - 16, width: drawerWidth - 16, display: loggedInState ? "inherit" : "none" }}
        />
      </IconButton>
    </Toolbar>
  </AppBar>
);

export default AppBarContent;
