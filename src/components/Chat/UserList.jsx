import { List, ListItem, ListItemText } from "@mui/material";
import React from "react";

function UserList({ users }) {
  return (
    <List>
      {users.map((user, index) => (
        <ListItem key={index}>
          <ListItemText primary={user.displayName} />
        </ListItem>
      ))}
    </List>
  );
}

export default UserList;
