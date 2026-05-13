import ChevronRightRounded from "@mui/icons-material/ChevronRightRounded";
import { Toolbar, Box, IconButton, Tooltip, alpha } from "@mui/material";
import { styled, useTheme } from "@mui/material/styles";

const MainBox = styled(Box)(({ theme }) => ({
	position: "absolute",
	flexGrow: 1,
	padding: 2,
	height: "100%",
	display: "flex",
	flexDirection: "column",
}));

const IconBox = styled(Box)(({ theme }) => ({
	backgroundColor: theme.palette.primary.main,
	position: "fixed",
	left: 0,
	p: 0,
	top: 0,
}));

function MainContent({ drawerWidth, drawerOpen, iconWidth, setDrawerOpen, children }) {
	const theme = useTheme();

	const handleDrawerToggle = () => {
		setDrawerOpen(!drawerOpen);
	};

	return (
		<MainBox
			data-testid="main-content"
			sx={{
				left: `${drawerOpen ? drawerWidth : 0}px`,
				width: `calc(100% - ${drawerOpen ? drawerWidth : 0}px)`,
				transition: `left ${drawerOpen ? theme.transitions.duration.leavingScreen : theme.transitions.duration.enteringScreen}ms, width ${
					drawerOpen ? theme.transitions.duration.leavingScreen : theme.transitions.duration.enteringScreen
				}ms`,
				background: (theme) =>
					`radial-gradient(circle at top left, ${alpha(theme.palette.primary.main, 0.16)}, transparent 32rem),
									 radial-gradient(circle at top right, ${alpha(theme.palette.info.main, 0.12)}, transparent 28rem)`,
			}}>
			<Toolbar
				variant="dense"
				data-testid="main-content-toolbar-spacer"
				sx={{
					height: drawerWidth,
					minHeight: drawerWidth,
				}}
			/>
			<IconBox
				data-testid="drawer-restore-control"
				sx={{
					width: `${drawerWidth}px`,
					height: `${drawerWidth}px`,
					".MuiSvgIcon-root": {
						color: theme.palette.text.primary,
						width: `${iconWidth * 1.25}px`,
						height: `${iconWidth * 1.25}px`,
					},
				}}>
				<Tooltip title="Maximize" placement="right">
					<IconButton
						data-testid="drawer-maximize-button"
						aria-label="Maximize navigation drawer"
						sx={{
							position: "absolute",
							top: 0,
							width: `${drawerWidth}px`,
							height: `${drawerWidth}px`,
						}}
						onClick={handleDrawerToggle}>
						<ChevronRightRounded />
					</IconButton>
				</Tooltip>
			</IconBox>
			<Box
				data-testid="main-content-body"
				sx={{
					flexGrow: 1,
					display: "flex",
					padding: theme.spacing(1),
					height: "50%",
				}}>
				{children}
			</Box>
		</MainBox>
	);
}

export default MainContent;
