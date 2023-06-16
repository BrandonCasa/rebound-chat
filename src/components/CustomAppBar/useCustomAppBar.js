import { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { setLoggedIn } from "reducers/authReducer";
import { setDialogOpened } from "reducers/dialogReducer";

export default function useCustomAppBar(width) {
  const loggedInState = useSelector((state) => state.auth.loggedIn);
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
    dispatch(setLoggedIn({ loggedIn: false }));
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
