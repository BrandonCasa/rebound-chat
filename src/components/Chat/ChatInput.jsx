import React from "react";
import { TextField, Button, Card, CardContent, Grid, Paper, IconButton } from "@mui/material";
import * as Icons from "@mui/icons-material";
import { useTheme } from "styled-components";

function ChatInput({ message, setMessage, sendMessage }) {
  const theme = useTheme();

  return (
    <Paper sx={{ display: "flex", padding: 1 }}>
      <form
        style={{ display: "flex", flexGrow: 1 }}
        onSubmit={(event) => {
          event.preventDefault();
          sendMessage();
        }}
      >
        <TextField fullWidth label="Type your message" value={message} onChange={(e) => setMessage(e.target.value)} sx={{ mr: 1 }} />
        <Button
          variant="contained"
          color="primary"
          onClick={sendMessage}
          endIcon={<Icons.Send sx={{ color: "rgba(0, 0, 0, 0.52)" }} style={{ fontSize: "26px" }} />}
        >
          Send
        </Button>
      </form>
    </Paper>
  );
}

export default ChatInput;
