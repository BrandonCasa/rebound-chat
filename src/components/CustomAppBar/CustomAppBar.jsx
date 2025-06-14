import { Box } from "@mui/material";
import { useTheme } from "@mui/material/styles";

import AccountMenu from "./AccountMenu";
import AppBarContent from "./AppBarContent";
import DrawerMenu from "./DrawerMenu";
import MainContent from "./MainContent";
import { useSelector } from "react-redux";

function CustomAppBar({
	drawerWidth,
	iconWidth,
	drawerOpen,
	setDrawerOpen,
	handleIconClick,
	loggedInState,
	anchorEl,
	open,
	handleClose,
	handleLogout,
	children,
}) {
	const theme = useTheme();
	const auth = useSelector((s) => s.auth);

        const titleOffset = window.isElectron ? 32 : 0;

        return (
                <Box
                        sx={{
                                display: "flex",
                                height: "100%",
                                width: "100%",
                                position: "fixed",
                                top: `${titleOffset}px`,
                        }}>
			<AppBarContent
				handleIconClick={handleIconClick}
				iconWidth={iconWidth}
				drawerWidth={drawerWidth}
				loggedInState={loggedInState}
				avatarUrl={auth.avatarUrl}
				theme={theme}
			/>
			<AccountMenu anchorEl={anchorEl} open={open} handleClose={handleClose} handleLogout={handleLogout} theme={theme} avatarUrl={auth.avatarUrl} />
			<DrawerMenu drawerWidth={drawerWidth} iconWidth={iconWidth} drawerOpen={drawerOpen} setDrawerOpen={setDrawerOpen} theme={theme} />
			<MainContent drawerWidth={drawerWidth} drawerOpen={drawerOpen} iconWidth={iconWidth} setDrawerOpen={setDrawerOpen}>
				{children}
			</MainContent>
		</Box>
	);
}

export default CustomAppBar;
