import InfoRounded from "@mui/icons-material/InfoRounded";
import Menu from "@mui/material/Menu";
import Badge from "@mui/material/Badge";
import MenuItem from "@mui/material/MenuItem";
import Chip from "@mui/material/Chip";
import IconButton from "@mui/material/IconButton";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Button from "@mui/material/Button";
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
		color: theme.palette.text.primary,
		boxShadow:
			"rgb(255, 255, 255) 0px 0px 0px 0px, rgba(0, 0, 0, 0.05) 0px 0px 0px 1px, rgba(0, 0, 0, 0.1) 0px 10px 15px -3px, rgba(0, 0, 0, 0.05) 0px 4px 6px -2px",
		"& .MuiMenu-list": {
			padding: "4px 0",
		},
		"& .MuiMenuItem-root": {
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

	const [infoChannelId, setInfoChannelId] = React.useState(null);

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

	const handleInfoOpen = (event, channelId) => {
		event.stopPropagation();
		setInfoChannelId(channelId);
	};

	const handleInfoClose = () => {
		setInfoChannelId(null);
	};

	const infoChannel = infoChannelId ? channels[infoChannelId] : null;

	return (
		<>
			<StyledMenu id="chat-room-menu" anchorEl={anchorEl} open={open} onClose={handleClose} data-testid="chat-room-menu">
				{Object.keys(channels).map((channel) => {
					const channelData = channels[channel];
					const isActive = socketState.currentRoom === channel;

					// Supports either field name.
					const isNsfw = Boolean(channelData.nsfw || channelData.isNsfw);

					return (
						<MenuItem
							key={channel}
							onClick={() => handleChannelSelect(channel)}
							disableRipple
							data-testid="chat-room-menu-item"
							data-channel-id={channel}
							aria-label={`Select channel ${channelData.name}`}
							sx={{
								display: "flex",
								alignItems: "center",
								justifyContent: "space-between",
								gap: 1.5,
								minWidth: 260,
							}}>
							<Badge
								anchorOrigin={{
									vertical: "top",
									horizontal: "left",
								}}
								sx={{ display: "flex", alignItems: "center", flex: 1, minWidth: 0 }}
								color="warning"
								variant={channelData.hasUnread ? "dot" : "standard"}>
								<Box sx={{ display: "flex", alignItems: "center", gap: 1, minWidth: 0 }}>
									<Chip
										data-testid="chat-room-menu-item-name"
										label={channelData.name}
										color={isActive ? "primary" : "default"}
										sx={{
											maxWidth: 150,
											fontWeight: isActive ? 700 : 500,
											"& .MuiChip-label": {
												overflow: "hidden",
												textOverflow: "ellipsis",
											},
										}}
									/>

									{isNsfw && (
										<Chip
											data-testid="chat-room-menu-item-nsfw"
											label="NSFW"
											color="error"
											size="small"
											sx={{
												fontWeight: 800,
												letterSpacing: 0.4,
												boxShadow: (theme) => `0 0 8px ${theme.palette.error.main}`,
											}}
										/>
									)}
								</Box>
							</Badge>

							<IconButton
								size="small"
								aria-label={`Info for ${channelData.name}`}
								data-testid="chat-room-menu-info-button"
								onClick={(event) => handleInfoOpen(event, channel)}
								sx={{
									ml: "auto",
									color: "text.secondary",
									"&:hover": {
										color: "primary.main",
										backgroundColor: "action.hover",
									},
								}}>
								<InfoRounded fontSize="small" />
							</IconButton>
						</MenuItem>
					);
				})}
			</StyledMenu>

			<Dialog open={Boolean(infoChannel)} onClose={handleInfoClose} fullWidth maxWidth="xs" data-testid="chat-room-info-dialog">
				<DialogTitle>
					<Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
						{infoChannel?.name}

						{Boolean(infoChannel?.nsfw || infoChannel?.isNsfw) && <Chip label="NSFW" color="error" size="small" sx={{ fontWeight: 800 }} />}
					</Box>
				</DialogTitle>

				<DialogContent dividers>
					<Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
						{infoChannel?.description || infoChannel?.info || "No channel description available."}
					</Typography>

					<Box sx={{ display: "grid", gap: 1 }}>
						<Typography variant="caption" color="text.secondary">
							Channel ID: {infoChannelId}
						</Typography>

						<Typography variant="caption" color="text.secondary">
							Unread: {infoChannel?.hasUnread ? "Yes" : "No"}
						</Typography>

						<Typography variant="caption" color="text.secondary">
							Visibility: {Boolean(infoChannel?.private || infoChannel?.isPrivate) ? "Private" : "Public"}
						</Typography>
					</Box>
				</DialogContent>

				<DialogActions>
					<Button onClick={handleInfoClose} data-testid="chat-room-info-close-button">
						Close
					</Button>
				</DialogActions>
			</Dialog>
		</>
	);
}
