import { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { setLoggedIn } from "slices/authSlice";
import { setDialogOpened } from "slices/dialogSlice";
import { addSnackbar } from "slices/snackbarSlice";

export default function useCustomAppBar(width) {
	const loggedInState = useSelector((state) => state.auth.loggedIn);
	const displayName = useSelector((state) => state.auth.displayName);
	const dispatch = useDispatch();

	const [drawerOpen, setDrawerOpen] = useState(true);

	let drawerWidth = (width + 1000) / 32;
	if (drawerWidth < 32) drawerWidth = 32;
	if (drawerWidth > 48) drawerWidth = 48;

	let iconWidth = (drawerWidth / 3) * 2;

	const [anchorEl, setAnchorEl] = useState(null);
	const open = Boolean(anchorEl);
	const handleAvatarClick = (event) => {
		setAnchorEl(event.currentTarget);
	};
	const handleClose = () => {
		setAnchorEl(null);
	};

	const handleLoginDialogOpen = () => {
		dispatch(setDialogOpened({ dialogName: "registerDialogOpen", newState: true, conflictingDialogs: ["loginDialogOpen"] }));
	};

	const handleLogout = () => {
		window.localStorage.removeItem("auth-token");
		const oldDisplayName = displayName;
		dispatch(setLoggedIn({ loggedIn: false }));
		dispatch(addSnackbar({ snackbarMsg: `Goodbye ${oldDisplayName}`, snackbarSeverity: "warning", autoHideDuration: 3000 }));
		handleClose();
	};

	const handleIconClick = (event) => {
		if (loggedInState) {
			handleAvatarClick(event);
		} else {
			handleLoginDialogOpen();
		}
	};

	return {
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
	};
}
