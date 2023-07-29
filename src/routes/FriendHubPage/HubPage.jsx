import { Grid, List, ListItem, ListItemText, ListSubheader, Paper } from "@mui/material";
import React from "react";

function ChatList() {
  return (
    <Paper
      sx={{
        width: "100%",
        height: "100%",
        overflow: "scroll",
        flexGrow: 1,
        minHeight: "175px",
      }}
    >
      <List
        sx={{
          width: "100%",
          height: "100%",
          bgcolor: "background.paper",
          flexGrow: 1,
          "& ul": { padding: 0 },
        }}
        subheader={<li />}
      >
        {["Favorites", "Overwatch", "Valorant"].map((chatGroup) => (
          <li key={`group-${chatGroup}`}>
            <ul>
              <ListSubheader>{`${chatGroup}`}</ListSubheader>
              {["phantompigz", "future_wizard", "Ranahan"].map((chatName) => (
                <ListItem key={`chat-${chatGroup}-${chatName}`}>
                  <ListItemText sx={{ ml: 3 }} primary={`${chatName}`} />
                </ListItem>
              ))}
            </ul>
          </li>
        ))}
      </List>
    </Paper>
  );
}

function HubPage() {
  return (
    <Grid container spacing={2} sx={{ justifyContent: "center", display: "flex", overflow: "hidden" }} rowGap={10000}>
      <Grid item xs={12} sm={4.75} md={3} display="flex" sx={{ overflow: "hidden", height: "100%" }}>
        <ChatList />
      </Grid>
      <Grid item xs={false} sm={7.25} md={9} display="flex" sx={{ overflow: "hidden", height: "100%" }}>
        <Paper sx={{ height: "100%", width: "100%" }}>xdd</Paper>
      </Grid>
    </Grid>
  );
}

export default HubPage;
