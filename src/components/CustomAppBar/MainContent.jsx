import ChevronRightRounded from "@mui/icons-material/ChevronRightRounded";
import { Toolbar, Box, IconButton, Tooltip } from "@mui/material";
import { styled, useTheme } from "@mui/material/styles";

const MainBox = styled(Box)(({ theme }) => ({
  position: "absolute",
  flexGrow: 1,
  padding: 2,
  height: "100%",
  display: "flex",
  flexDirection: "column",
}));

const IconBox = styled(Box)(({ theme }) => ({
  backgroundColor: theme.palette.primary.main,
  position: "fixed",
  left: 0,
  p: 0,
  top: 0,
}));

function MainContent({
  drawerWidth,
  drawerOpen,
  iconWidth,
  setDrawerOpen,
  children,
}) {
  const theme = useTheme();

  const handleDrawerToggle = () => {
    setDrawerOpen(!drawerOpen);
  };

  return (
    <MainBox
      sx={{
        left: `${drawerOpen ? drawerWidth : 0}px`,
        width: `calc(100% - ${drawerOpen ? drawerWidth : 0}px)`,
        transition: `left ${drawerOpen ? theme.transitions.duration.leavingScreen : theme.transitions.duration.enteringScreen}ms, width ${
          drawerOpen
            ? theme.transitions.duration.leavingScreen
            : theme.transitions.duration.enteringScreen
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
      <IconBox
        sx={{
          width: `${drawerWidth}px`,
          height: `${drawerWidth}px`,
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
            onClick={handleDrawerToggle}
          >
            <ChevronRightRounded />
          </IconButton>
        </Tooltip>
      </IconBox>
      <Box
        sx={{
          flexGrow: 1,
          display: "flex",
          padding: theme.spacing(1),
          height: "50%",
        }}
      >
        {children}
      </Box>
    </MainBox>
  );
}

export default MainContent;
