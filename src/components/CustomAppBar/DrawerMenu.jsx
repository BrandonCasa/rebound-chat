import { Toolbar, List, Divider, Drawer, Tooltip, ListItem, ListItemButton, ListItemIcon } from "@mui/material";
import * as Icons from "@mui/icons-material";
import { useNavigate } from "react-router-dom";

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

function DrawerMenu({ drawerWidth, iconWidth, drawerOpen, setDrawerOpen, theme }) {
  const navigate = useNavigate();

  return (
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
          <ListItemIcon
            sx={{ opacity: window.location.pathname.toString() === "/" ? "0.5" : "1.0" }}
            onClick={() => {
              navigate("/");
            }}
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
          ".MuiSvgIcon-root": {
            color: theme.palette.text.primary,
          },
        }}
      >
        <ListItemWithTooltip key="FriendHub" title="Friends" placement="right">
          <ListItemIcon sx={{ opacity: window.location.pathname.toString() === "/friends" ? "0.5" : "1.0" }}>
            <Icons.PeopleAltRounded />
          </ListItemIcon>
        </ListItemWithTooltip>
        <ListItemWithTooltip key="Chat" title="Chat" placement="right">
          <ListItemIcon
            sx={{ opacity: window.location.pathname.toString() === "/chat" ? "0.5" : "1.0" }}
            onClick={() => {
              navigate("/chat");
            }}
          >
            <Icons.MessageRounded />
          </ListItemIcon>
        </ListItemWithTooltip>
        <ListItemWithTooltip key="Servers" title="Servers" placement="right">
          <ListItemIcon sx={{ opacity: window.location.pathname.toString() === "/servers" ? "0.5" : "1.0" }}>
            <Icons.DnsRounded />
          </ListItemIcon>
        </ListItemWithTooltip>
        <ListItemWithTooltip key="Profile" title="Profile" placement="right">
          <ListItemIcon
            sx={{ opacity: window.location.pathname.toString() === "/profile" ? "0.5" : "1.0" }}
            onClick={() => {
              navigate("/profile");
            }}
          >
            <Icons.PersonRounded />
          </ListItemIcon>
        </ListItemWithTooltip>
        <ListItemWithTooltip key="Settings" title="Settings" placement="right">
          <ListItemIcon sx={{ opacity: window.location.pathname.toString() === "/settings" ? "0.5" : "1.0" }}>
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
  );
}

export default DrawerMenu;
