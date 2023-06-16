import { ListItemWithTooltip, Toolbar, List, Divider, Drawer, Box, IconButton, Tooltip } from "@mui/material";
import * as Icons from "@mui/icons-material";

const MainContent = ({ drawerWidth, drawerOpen, theme, iconWidth, setDrawerOpen, children }) => (
  <Box
    component="main"
    sx={{
      position: "absolute",
      flexGrow: 1,
      p: 2,
      height: "100%",
      display: "flex",
      flexDirection: "column",
      left: `${drawerOpen ? drawerWidth : 0}px`,
      width: `calc(100% - ${drawerOpen ? drawerWidth : 0}px)`,
      transition: `left ${drawerOpen ? theme.transitions.duration.leavingScreen : theme.transitions.duration.enteringScreen}ms, width ${
        drawerOpen ? theme.transitions.duration.leavingScreen : theme.transitions.duration.enteringScreen
      }ms`,
    }}
  >
    <Toolbar
      variant="dense"
      sx={{
        height: drawerWidth,
        minHeight: drawerWidth,
      }}
    />
    <Box
      sx={{
        backgroundColor: theme.palette.primary.main,
        position: "fixed",
        width: `${drawerWidth}px`,
        height: `${drawerWidth}px`,
        left: 0,
        p: 0,
        top: 0,
        ".MuiSvgIcon-root": {
          color: theme.palette.text.primary,
          width: `${iconWidth * 1.25}px`,
          height: `${iconWidth * 1.25}px`,
        },
      }}
    >
      <Tooltip title="Maximize" placement="right">
        <IconButton
          sx={{
            position: "absolute",
            top: 0,
            width: `${drawerWidth}px`,
            height: `${drawerWidth}px`,
          }}
          onClick={() => setDrawerOpen(!drawerOpen)}
        >
          <Icons.ChevronRightRounded />
        </IconButton>
      </Tooltip>
    </Box>
    <Box sx={{ flexGrow: 1, display: "flex" }}>{children}</Box>
  </Box>
);

export default MainContent;
