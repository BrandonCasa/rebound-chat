import PersonAddRounded from "@mui/icons-material/PersonAddRounded";
import PersonRemoveRounded from "@mui/icons-material/PersonRemoveRounded";
import LogoutRounded from "@mui/icons-material/LogoutRounded";
import { Menu, MenuList, MenuItem, ListItemIcon, ListItemText, Divider, Avatar } from "@mui/material";

const AccountMenu = ({ anchorEl, open, handleClose, handleLogout, theme, avatarUrl }) => (
	<Menu
		anchorEl={anchorEl}
		open={open}
		onClose={handleClose}
		sx={{ mt: 1 }}
		transformOrigin={{ horizontal: "right", vertical: "top" }}
		anchorOrigin={{ horizontal: "right", vertical: "bottom" }}>
		<MenuList>
			<MenuItem>
				<ListItemIcon>
					<Avatar src={avatarUrl} sx={{ width: "28px", height: "28px" }} />
				</ListItemIcon>
				<ListItemText>Main Profile</ListItemText>
			</MenuItem>
			<Divider />
			<MenuItem onClick={handleLogout}>
				<ListItemIcon>
					<LogoutRounded fontSize="small" sx={{ color: theme.palette.text.secondary }} />
				</ListItemIcon>
				<ListItemText>Logout</ListItemText>
			</MenuItem>
		</MenuList>
	</Menu>
);

export default AccountMenu;
