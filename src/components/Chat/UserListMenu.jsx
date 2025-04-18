import * as Icons from "@mui/icons-material";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import { styled, alpha } from "@mui/material/styles";
import * as React from "react";
import { useSelector } from "react-redux";

const StyledMenu = styled((props) => (
  <Menu
    elevation={5}
    anchorOrigin={{
      vertical: "bottom",
      horizontal: "right",
    }}
    transformOrigin={{
      vertical: "top",
      horizontal: "right",
    }}
    {...props}
  />
))(({ theme }) => ({
  "& .MuiPaper-root": {
    borderRadius: 6,
    marginTop: theme.spacing(2),
    minWidth: 180,
    color: theme.palette.text.primary,
    boxShadow:
      "rgb(255, 255, 255) 0px 0px 0px 0px, rgba(0, 0, 0, 0.05) 0px 0px 0px 1px, rgba(0, 0, 0, 0.1) 0px 10px 15px -3px, rgba(0, 0, 0, 0.05) 0px 4px 6px -2px",
    "& .MuiMenu-list": {
      padding: "4px 0",
    },
    "& .MuiMenuItem-root": {
      "& .MuiSvgIcon-root": {
        fontSize: 18,
        color: theme.palette.text.secondary,
        marginRight: theme.spacing(1.5),
      },
      "&:active": {
        backgroundColor: alpha(
          theme.palette.primary.main,
          theme.palette.action.selectedOpacity,
        ),
      },
    },
  },
}));

export default function UserListMenu({ anchorEl, setAnchorEl, users }) {
  const open = Boolean(anchorEl);
  const authState = useSelector((state) => state.auth);

  const handleClose = () => {
    setAnchorEl(null);
  };

  return (
    <StyledMenu
      id="user-list-menu"
      anchorEl={anchorEl}
      open={open}
      onClose={handleClose}
    >
      {Object.keys(users).map((user, index) => (
        <MenuItem
          key={index}
          disableRipple
          selected={users[user].username === authState.username}
        >
          <Icons.PersonRounded />
          {users[user].displayName}
        </MenuItem>
      ))}
    </StyledMenu>
  );
}
