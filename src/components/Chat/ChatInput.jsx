import React, { useEffect, useRef, useState } from "react";
import { TextField, Button, Card, CardContent, Grid, Paper, IconButton, useTheme, Box } from "@mui/material";
import * as Icons from "@mui/icons-material";

function ChatInput({ message, setMessage, sendMessage }) {
  const theme = useTheme();

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "row",
        padding: 1 / theme.spacingMultFull,
        mt: -1 / theme.spacingMultFull,
      }}
    >
      <div style={{ width: "100%" }}>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            sendMessage();
          }}
        >
          <TextField
            //multiline
            variant="outlined"
            size="small"
            fullWidth
            label="Type your message"
            value={message}
            onChange={(e) => {
              setMessage(e.currentTarget.value);
            }}
          />
        </form>
      </div>
      <Button
        sx={{ height: "40px", margin: "auto", ml: 1 / theme.spacingMultFull }}
        variant="contained"
        color="primary"
        onClick={sendMessage}
        endIcon={<Icons.Send sx={{ color: "rgba(0, 0, 0, 0.52)" }} style={{ fontSize: "26px" }} />}
      >
        Send
      </Button>
    </Box>
  );
}

export default ChatInput;
