import { ListItemWithTooltip, Toolbar, List, Divider, Drawer, Box, IconButton, Tooltip } from "@mui/material";
import * as Icons from "@mui/icons-material";
import PropTypes from "prop-types";
import { styled } from "@mui/material/styles";

const MainBox = styled(Box)(({ theme, drawerOpen, drawerWidth }) => ({
  position: "absolute",
  flexGrow: 1,
  padding: 2,
  height: "100%",
  display: "flex",
  flexDirection: "column",
  left: `${drawerOpen ? drawerWidth : 0}px`,
  width: `calc(100% - ${drawerOpen ? drawerWidth : 0}px)`,
  transition: `left ${drawerOpen ? theme.transitions.duration.leavingScreen : theme.transitions.duration.enteringScreen}ms, width ${
    drawerOpen ? theme.transitions.duration.leavingScreen : theme.transitions.duration.enteringScreen
  }ms`,
}));

const IconBox = styled(Box)(({ theme, drawerWidth, iconWidth }) => ({
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
}));

function MainContent({ drawerWidth, drawerOpen, theme, iconWidth, setDrawerOpen, children }) {
  const handleDrawerToggle = () => {
    setDrawerOpen(!drawerOpen);
  };

  return (
    <MainBox drawerOpen={drawerOpen} drawerWidth={drawerWidth} theme={theme}>
      <Toolbar
        variant="dense"
        sx={{
          height: drawerWidth,
          minHeight: drawerWidth,
        }}
      />
      <IconBox drawerWidth={drawerWidth} theme={theme} iconWidth={iconWidth}>
        <Tooltip title="Maximize" placement="right">
          <IconButton
            sx={{
              position: "absolute",
              top: 0,
              width: `${drawerWidth}px`,
              height: `${drawerWidth}px`,
            }}
            onClick={handleDrawerToggle}
          >
            <Icons.ChevronRightRounded />
          </IconButton>
        </Tooltip>
      </IconBox>
      <Box sx={{ flexGrow: 1, display: "flex", padding: 2, height: "50%" }}>{children}</Box>
    </MainBox>
  );
}

MainContent.propTypes = {
  drawerWidth: PropTypes.number.isRequired,
  drawerOpen: PropTypes.bool.isRequired,
  theme: PropTypes.object.isRequired,
  iconWidth: PropTypes.number.isRequired,
  setDrawerOpen: PropTypes.func.isRequired,
  children: PropTypes.node,
};

export default MainContent;
