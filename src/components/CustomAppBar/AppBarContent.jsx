import AccountCircleRounded from "@mui/icons-material/AccountCircleRounded";
import { AppBar, Toolbar, Typography, IconButton, Avatar } from "@mui/material";
import logo from "../../logo.svg";

const AppBarContent = ({ handleIconClick, drawerWidth, loggedInState, avatarUrl, theme }) => (
	<AppBar
		position="fixed"
		data-testid="app-bar"
		sx={{
			width: `calc(100% - ${drawerWidth}px)`,
			ml: `${drawerWidth}px`,
			boxShadow: "none",
		}}>
		<Toolbar
			data-testid="app-bar-toolbar"
			variant="dense"
			disableGutters
			sx={{
				height: drawerWidth,
				minHeight: drawerWidth,
				pr: 2,
				display: "flex",
			}}>
			<img
				src={logo}
				alt="logo"
				data-testid="app-bar-logo"
				style={{ height: "100%", padding: theme.spacing(0.5), filter: "drop-shadow( 3px 3px 2px rgba(0, 0, 0, .7))" }}
			/>
			<Typography variant="h6" noWrap component="div">
				Rebound
			</Typography>
			<IconButton
				color="secondary"
				onClick={handleIconClick}
				sx={{ mr: theme.spacing(-1), ml: "auto" }}
				data-testid="app-bar-account-button"
				aria-label="Open account menu">
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
