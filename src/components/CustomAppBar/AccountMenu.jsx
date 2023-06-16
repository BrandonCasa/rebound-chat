import { Menu, MenuList, MenuItem, ListItemIcon, ListItemText, Divider, Avatar } from "@mui/material";
import * as Icons from "@mui/icons-material";

const AccountMenu = ({ anchorEl, open, handleClose, handleLogout, theme }) => (
  <Menu
    anchorEl={anchorEl}
    open={open}
    onClose={handleClose}
    sx={{ mt: 1 }}
    transformOrigin={{ horizontal: "right", vertical: "top" }}
    anchorOrigin={{ horizontal: "right", vertical: "bottom" }}
  >
    <MenuList>
      <MenuItem>
        <ListItemIcon>
          <Avatar sx={{ width: "28px", height: "28px" }} />
        </ListItemIcon>
        <ListItemText>Main Profile</ListItemText>
      </MenuItem>
      <Divider />
      <MenuItem>
        <ListItemIcon>
          <Icons.PersonAddRounded fontSize="small" sx={{ color: theme.palette.text.secondary }} />
        </ListItemIcon>
        <ListItemText>Add Profile</ListItemText>
      </MenuItem>
      <MenuItem>
        <ListItemIcon>
          <Icons.PersonRemoveRounded fontSize="small" sx={{ color: theme.palette.text.secondary }} />
        </ListItemIcon>
        <ListItemText>Remove Profile</ListItemText>
      </MenuItem>
      <Divider />
      <MenuItem onClick={handleLogout}>
        <ListItemIcon>
          <Icons.LogoutRounded fontSize="small" sx={{ color: theme.palette.text.secondary }} />
        </ListItemIcon>
        <ListItemText>Logout</ListItemText>
      </MenuItem>
    </MenuList>
  </Menu>
);

export default AccountMenu;
