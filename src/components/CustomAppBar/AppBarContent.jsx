import AccountCircleRounded from "@mui/icons-material/AccountCircleRounded";
import { AppBar, Toolbar, Typography, IconButton, Avatar } from "@mui/material";

const AppBarContent = ({ handleIconClick, drawerWidth, loggedInState, avatarUrl, theme }) => (
        <AppBar
                position="fixed"
                sx={{
                        width: `calc(100% - ${drawerWidth}px)`,
                        ml: `${drawerWidth}px`,
                        boxShadow: "none",
                        top: `${window.isElectron ? 32 : 0}px`,
                }}>
		<Toolbar
			variant="dense"
			sx={{
				height: drawerWidth,
				minHeight: drawerWidth,
			}}>
			<Typography variant="h6" noWrap component="div" sx={{ flexGrow: 1 }}>
				Rebound
			</Typography>
			<IconButton color="secondary" onClick={handleIconClick} sx={{ mr: theme.spacing(-1) }}>
				<AccountCircleRounded
					sx={{
						height: drawerWidth - 16,
						width: drawerWidth - 16,
						display: loggedInState ? "none" : "inherit",
					}}
				/>
				<Avatar
					alt="User"
					src={avatarUrl}
					sx={{
						height: drawerWidth - 16,
						width: drawerWidth - 16,
						display: loggedInState ? "inherit" : "none",
					}}
				/>
			</IconButton>
		</Toolbar>
	</AppBar>
);

export default AppBarContent;
