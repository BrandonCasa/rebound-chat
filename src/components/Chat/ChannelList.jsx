import { List, ListItemText, ListItemButton } from "@mui/material";
import React from "react";
import { useDispatch, useSelector } from "react-redux";

import { setActiveSocketRoom } from "slices/socketSlice";

function ChannelList({ channels, setMessages }) {
	const socketState = useSelector((state) => state.sockets);
	const dispatch = useDispatch();

	return (
		<List sx={{ display: "flex", flexDirection: "column" }}>
			{Object.keys(channels).map((channel) => (
				<ListItemButton
					key={channel}
					selected={socketState.currentRoom === channel}
					onClick={() => {
						if (socketState.currentRoom !== channel) {
							setMessages([]);
						}
						dispatch(
							setActiveSocketRoom({
								lastRoom: socketState.currentRoom,
								currentRoom: channel,
							})
						);
					}}>
					<ListItemText primary={channels[channel].name} />
				</ListItemButton>
			))}
		</List>
	);
}

export default ChannelList;
