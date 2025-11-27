import DnsRounded from "@mui/icons-material/DnsRounded";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import { styled, alpha } from "@mui/material/styles";
import * as React from "react";
import { useDispatch, useSelector } from "react-redux";

import { setActiveSocketRoom } from "../../slices/socketSlice";

const StyledMenu = styled((props) => (
	<Menu
		elevation={5}
		anchorOrigin={{
			vertical: "bottom",
			horizontal: "left",
		}}
		transformOrigin={{
			vertical: "top",
			horizontal: "left",
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
				backgroundColor: alpha(theme.palette.primary.main, theme.palette.action.selectedOpacity),
			},
		},
	},
}));

export default function ChatRoomMenu({ anchorEl, setAnchorEl, channels, setMessages }) {
	const open = Boolean(anchorEl);
	const socketState = useSelector((state) => state.sockets);
	const dispatch = useDispatch();

	const handleClose = () => {
		setAnchorEl(null);
	};

	const handleChannelSelect = (channel) => {
		if (socketState.currentRoom !== channel) {
			setMessages([]);
		}
		dispatch(
			setActiveSocketRoom({
				lastRoom: socketState.currentRoom,
				currentRoom: channel,
			})
		);
		handleClose();
	};

	return (
		<StyledMenu id="chat-room-menu" anchorEl={anchorEl} open={open} onClose={handleClose}>
			{Object.keys(channels).map((channel, index) => (
				<MenuItem key={index} onClick={() => handleChannelSelect(channel)} disableRipple selected={socketState.currentRoom === channel}>
					<DnsRounded />
					{channels[channel].name}
				</MenuItem>
			))}
		</StyledMenu>
	);
}
