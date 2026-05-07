import { List, ListItem, ListItemText } from "@mui/material";
import React from "react";

function UserList({ users }) {
	return (
		<List data-testid="chat-user-list">
			{users.map((user, index) => (
				<ListItem key={index} data-testid="chat-user-list-item" data-user-id={user.id || user._id || ""}>
					<ListItemText primary={user.displayName} />
				</ListItem>
			))}
		</List>
	);
}

export default UserList;
