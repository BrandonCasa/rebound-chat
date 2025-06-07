import * as Icons from "@mui/icons-material";
import {
  Toolbar,
  List,
  Divider,
  Drawer,
  Tooltip,
  ListItem,
  ListItemButton,
  ListItemIcon,
} from "@mui/material";
import { useNavigate, useLocation } from "react-router-dom";

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

function DrawerMenu({
  drawerWidth,
  iconWidth,
  drawerOpen,
  setDrawerOpen,
  theme,
}) {
  const navigate = useNavigate();
  const location = useLocation();

  // helper to determine if this is the active route
  const isActive = (path) => location.pathname === path;

  return (
    <Drawer
      sx={drawerStyles(drawerWidth, iconWidth)}
      anchor="left"
      variant="persistent"
      open={drawerOpen}
    >
      <Toolbar
        variant="dense"
        disableGutters
        sx={{ height: drawerWidth, minHeight: drawerWidth }}
      >
        <ListItemWithTooltip title="Home" placement="right">
          <ListItemIcon
            sx={{ opacity: isActive("/") ? 0.5 : 1.0 }}
            onClick={() => navigate("/")}
          >
            <Icons.HomeRounded sx={{ color: theme.palette.secondary.light }} />
          </ListItemIcon>
        </ListItemWithTooltip>
      </Toolbar>
      <Divider />
      <List
        sx={{
          p: 0,
          pb: 1,
          ".MuiSvgIcon-root": { color: theme.palette.text.primary },
        }}
      >
        {[
          {
            key: "friends",
            title: "Friends",
            path: "/friends",
            Icon: Icons.PeopleAltRounded,
          },
          {
            key: "chat",
            title: "Chat",
            path: "/chat",
            Icon: Icons.MessageRounded,
          },
          {
            key: "servers",
            title: "Servers",
            path: "/servers",
            Icon: Icons.DnsRounded,
          },
          {
            key: "profile",
            title: "Profile",
            path: "/profile",
            Icon: Icons.PersonRounded,
          },
          {
            key: "testing",
            title: "Testing",
            path: "/testing",
            Icon: Icons.ScienceTwoTone,
          },
          {
            key: "settings",
            title: "Settings",
            path: "/settings",
            Icon: Icons.SettingsRounded,
          },
        ].map(({ key, title, path, Icon }) => (
          <ListItemWithTooltip key={key} title={title} placement="right">
            <ListItemIcon
              sx={{ opacity: isActive(path) ? 0.5 : 1.0 }}
              onClick={() => {
                navigate(path);
              }}
            >
              <Icon />
            </ListItemIcon>
          </ListItemWithTooltip>
        ))}
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
        <ListItemWithTooltip key="toggle" title="Minimize" placement="right">
          <ListItemButton
            sx={{ p: 0, m: 0 }}
            onClick={() => setDrawerOpen(!drawerOpen)}
          >
            <ListItemIcon>
              <Icons.ChevronLeftRounded />
            </ListItemIcon>
          </ListItemButton>
        </ListItemWithTooltip>
      </List>
    </Drawer>
  );
}

export default DrawerMenu;
