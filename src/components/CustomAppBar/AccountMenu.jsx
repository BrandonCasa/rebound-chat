import PersonAddRounded from "@mui/icons-material/PersonAddRounded";
import PersonRemoveRounded from "@mui/icons-material/PersonRemoveRounded";
import LogoutRounded from "@mui/icons-material/LogoutRounded";
import { Menu, MenuList, MenuItem, ListItemIcon, ListItemText, Divider, Avatar } from "@mui/material";

const AccountMenu = ({ anchorEl, open, handleClose, handleLogout, theme, avatarUrl }) => (
	<Menu
		data-testid="account-menu"
		anchorEl={anchorEl}
		open={open}
		onClose={handleClose}
		sx={{ mt: 1 }}
		transformOrigin={{ horizontal: "right", vertical: "top" }}
		anchorOrigin={{ horizontal: "right", vertical: "bottom" }}>
		<MenuList data-testid="account-menu-list">
			<MenuItem data-testid="account-menu-profile-item">
				<ListItemIcon>
					<Avatar src={avatarUrl} sx={{ width: "28px", height: "28px" }} />
				</ListItemIcon>
				<ListItemText>Main Profile</ListItemText>
			</MenuItem>
			<Divider />
			<MenuItem onClick={handleLogout} data-testid="account-menu-logout-item">
				<ListItemIcon>
					<LogoutRounded fontSize="small" sx={{ color: theme.palette.text.secondary }} />
				</ListItemIcon>
				<ListItemText>Logout</ListItemText>
			</MenuItem>
		</MenuList>
	</Menu>
);

export default AccountMenu;
