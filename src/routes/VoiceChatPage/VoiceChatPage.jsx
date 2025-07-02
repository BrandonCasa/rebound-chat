import React from "react";
import { Box, Typography } from "@mui/material";
import useVoiceChatPage from "./useVoiceChatPage";

export default function VoiceChatPage() {
    // Initialize placeholder hook
    useVoiceChatPage();

    return (
        <Box sx={{ flexGrow: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
            <Typography variant="h4" gutterBottom>
                Voice Chat
            </Typography>
            <Typography variant="body1" color="text.secondary">
                Voice chat features will live here soon.
            </Typography>
        </Box>
    );
}
