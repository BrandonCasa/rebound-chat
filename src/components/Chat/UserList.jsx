import React from "react";
import { List, ListItem, ListItemText, Card } from "@mui/material";

function UserList({ users }) {
  return (
    <Card>
      <List>
        {users.map((user, index) => (
          <ListItem key={index}>
            <ListItemText primary={user.username} />
          </ListItem>
        ))}
      </List>
    </Card>
  );
}

export default UserList;
