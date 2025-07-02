import HomeRounded from "@mui/icons-material/HomeRounded";
import PeopleAltRounded from "@mui/icons-material/PeopleAltRounded";
import MessageRounded from "@mui/icons-material/MessageRounded";
import RecordVoiceOverRounded from "@mui/icons-material/RecordVoiceOverRounded";
import DnsRounded from "@mui/icons-material/DnsRounded";
import PersonRounded from "@mui/icons-material/PersonRounded";
import ScienceTwoTone from "@mui/icons-material/ScienceTwoTone";
import SettingsRounded from "@mui/icons-material/SettingsRounded";
import ChevronLeftRounded from "@mui/icons-material/ChevronLeftRounded";
import { Toolbar, List, Divider, Drawer, Tooltip, ListItem, ListItemButton, ListItemIcon } from "@mui/material";
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

function DrawerMenu({ drawerWidth, iconWidth, drawerOpen, setDrawerOpen, theme }) {
	const navigate = useNavigate();
	const location = useLocation();

	// helper to determine if this is the active route
	const isActive = (path) => location.pathname === path;

	return (
		<Drawer sx={drawerStyles(drawerWidth, iconWidth)} anchor="left" variant="persistent" open={drawerOpen}>
			<Toolbar variant="dense" disableGutters sx={{ height: drawerWidth, minHeight: drawerWidth }}>
				<ListItemWithTooltip title="Home" placement="right">
					<ListItemIcon sx={{ opacity: isActive("/") ? 0.5 : 1.0 }} onClick={() => navigate("/")}>
						<HomeRounded sx={{ color: theme.palette.secondary.light }} />
					</ListItemIcon>
				</ListItemWithTooltip>
			</Toolbar>
			<Divider />
			<List
				sx={{
					p: 0,
					pb: 1,
					".MuiSvgIcon-root": { color: theme.palette.text.primary },
				}}>
				{[
					{
						key: "friends",
						title: "Friends",
						path: "/friends",
						Icon: PeopleAltRounded,
					},
                                        {
                                                key: "chat",
                                                title: "Chat",
                                                path: "/chat",
                                                Icon: MessageRounded,
                                        },
                                        {
                                                key: "voicechat",
                                                title: "Voice Chat",
                                                path: "/voicechat",
                                                Icon: RecordVoiceOverRounded,
                                        },
                                        {
                                                key: "servers",
                                                title: "Servers",
                                                path: "/servers",
                                                Icon: DnsRounded,
					},
					{
						key: "profile",
						title: "Profile",
						path: "/profile",
						Icon: PersonRounded,
					},
					{
						key: "testing",
						title: "Testing",
						path: "/testing",
						Icon: ScienceTwoTone,
					},
					{
						key: "settings",
						title: "Settings",
						path: "/settings",
						Icon: SettingsRounded,
					},
				].map(({ key, title, path, Icon }) => (
					<ListItemWithTooltip key={key} title={title} placement="right">
						<ListItemIcon
							sx={{ opacity: isActive(path) ? 0.5 : 1.0 }}
							onClick={() => {
								navigate(path);
							}}>
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
				}}>
				<ListItemWithTooltip key="toggle" title="Minimize" placement="right">
					<ListItemButton sx={{ p: 0, m: 0 }} onClick={() => setDrawerOpen(!drawerOpen)}>
						<ListItemIcon>
							<ChevronLeftRounded />
						</ListItemIcon>
					</ListItemButton>
				</ListItemWithTooltip>
			</List>
		</Drawer>
	);
}

export default DrawerMenu;
