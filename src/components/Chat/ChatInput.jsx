import React from "react";
import { TextField, Button, Card, CardContent, Grid } from "@mui/material";

function ChatInput({ message, setMessage, sendMessage }) {
  return (
    <Card>
      <CardContent>
        <Grid container justifyContent="center" alignItems="center" spacing={2}>
          <Grid item xs={10}>
            <TextField fullWidth label="Type your message" value={message} onChange={(e) => setMessage(e.target.value)} />
          </Grid>
          <Grid item xs={2}>
            <Button variant="contained" color="primary" onClick={sendMessage}>
              Send
            </Button>
          </Grid>
        </Grid>
      </CardContent>
    </Card>
  );
}

export default ChatInput;
