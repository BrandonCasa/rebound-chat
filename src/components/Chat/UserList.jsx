import React from "react";
import { List, ListItem, ListItemText, Card } from "@mui/material";

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
