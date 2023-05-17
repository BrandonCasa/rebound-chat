import {
  AppBar,
  Box,
  Button,
  Card,
  CardContent,
  CardHeader,
  Chip,
  Collapse,
  Container,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Paper,
  Stack,
  Toolbar,
  Tooltip,
  Typography,
} from "@mui/material";
import { styled, useTheme } from "@mui/material/styles";
import Grid from "@mui/material/Unstable_Grid2";
import { TransitionGroup } from "react-transition-group";
import * as Icons from "@mui/icons-material";
import useWindowDimensions from "../helpers/useWindowDimensions";
import { useEffect, useState } from "react";
import { useDispatch } from "react-redux";
import { setDialogOpened } from "../reducers/dialogReducer";

const drawerStyles = (drawerWidth, iconWidth) => ({
  width: drawerWidth,
  flexShrink: 0,
  "& .MuiDrawer-paper": {
    width: `${drawerWidth}px`,
    boxSizing: "border-box",
  },
  ".MuiSvgIcon-root": {
    width: `${iconWidth}px`,
    height: `${iconWidth}px`,
    margin: `${(drawerWidth - iconWidth) / 2}px`,
  },
});

const ListItemWithTooltip = ({ title, placement, children }) => (
  <ListItem disablePadding>
    <Tooltip title={title} placement={placement}>
      <ListItemButton sx={{ p: 0 }}>{children}</ListItemButton>
    </Tooltip>
  </ListItem>
);

function CustomAppBar(props) {
  const dispatch = useDispatch();
  let theme = useTheme();
  const { height, width } = useWindowDimensions();
  const [drawerOpen, setDrawerOpen] = useState(true);

  let drawerWidth = (width + 1000) / 32;
  if (drawerWidth < 32) drawerWidth = 32;
  if (drawerWidth > 48) drawerWidth = 48;

  let iconWidth = (drawerWidth / 3) * 2;

  const handleLoginDialogOpen = () => {
    dispatch(setDialogOpened({ dialogName: "loginDialogOpen", newState: true }));
  };

  return (
    <Box sx={{ display: "flex", height: "100%" }}>
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
          <Button variant="contained" color="secondary" sx={{ height: `${iconWidth}px` }} onClick={handleLoginDialogOpen}>
            Login
          </Button>
        </Toolbar>
      </AppBar>
      <Drawer sx={drawerStyles(drawerWidth, iconWidth)} anchor="left" variant="persistent" open={drawerOpen}>
        <Toolbar
          variant="dense"
          disableGutters
          sx={{
            height: drawerWidth,
            minHeight: drawerWidth,
          }}
        >
          <ListItemWithTooltip title="Home" placement="right">
            <ListItemIcon>
              <Icons.HomeRounded sx={{ color: theme.palette.secondary.light }} />
            </ListItemIcon>
          </ListItemWithTooltip>
        </Toolbar>
        <Divider />
        <List
          sx={{
            p: 0,
            pb: 1,
            ".MuiSvgIcon-root": {
              color: theme.palette.text.primary,
            },
          }}
        >
          <ListItemWithTooltip key="FriendHub" title="Hub" placement="right">
            <ListItemIcon>
              <Icons.PeopleAltRounded />
            </ListItemIcon>
          </ListItemWithTooltip>
          <ListItemWithTooltip key="Messages" title="Messages" placement="right">
            <ListItemIcon>
              <Icons.MessageRounded />
            </ListItemIcon>
          </ListItemWithTooltip>
          <ListItemWithTooltip key="Servers" title="Servers" placement="right">
            <ListItemIcon>
              <Icons.DnsRounded />
            </ListItemIcon>
          </ListItemWithTooltip>
          <ListItemWithTooltip key="Profile" title="Profile" placement="right">
            <ListItemIcon>
              <Icons.PersonRounded />
            </ListItemIcon>
          </ListItemWithTooltip>
          <ListItemWithTooltip key="Settings" title="Settings" placement="right">
            <ListItemIcon>
              <Icons.SettingsRounded />
            </ListItemIcon>
          </ListItemWithTooltip>
        </List>
        <List
          sx={{
            p: 0,
            mt: "auto",
            ".MuiSvgIcon-root": {
              color: theme.palette.text.primary,
              width: `${iconWidth * 1.25}px`,
              height: `${iconWidth * 1.25}px`,
              margin: `${(drawerWidth - iconWidth * 1.25) / 2}px`,
            },
          }}
        >
          <ListItemWithTooltip key="Minimize" title="Minimize" placement="right">
            <ListItemButton sx={{ p: 0, mt: 1 }} onClick={() => setDrawerOpen(!drawerOpen)}>
              <ListItemIcon>
                <Icons.ChevronLeftRounded />
              </ListItemIcon>
            </ListItemButton>
          </ListItemWithTooltip>
        </List>
      </Drawer>
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
        <Box sx={{ flexGrow: 1, display: "flex" }}>{props.children}</Box>
      </Box>
    </Box>
  );
}

export default CustomAppBar;
