import React from "react";
import { List, ListItem, ListItemText, Card, ListItemButton } from "@mui/material";
import { useDispatch, useSelector } from "react-redux";
import { setSocketRoom } from "reducers/authReducer";

function ChannelList({ channels, setMessages }) {
  const authState = useSelector((state) => state.auth);
  const dispatch = useDispatch();

  return (
    <List sx={{ display: "flex", flexDirection: "column" }}>
      {Object.keys(channels).map((channel) => (
        <ListItemButton
          key={channel}
          selected={authState.socketInfo.currentRoom === channel}
          onClick={() => {
            if (authState.socketInfo.currentRoom !== channel) {
              setMessages([]);
            }
            dispatch(setSocketRoom({ lastRoom: authState.socketInfo.currentRoom, currentRoom: channel }));
          }}
        >
          <ListItemText primary={channels[channel].name} />
        </ListItemButton>
      ))}
    </List>
  );
}

export default ChannelList;
