import Send from "@mui/icons-material/Send";
import { TextField, Button, useTheme, Box } from "@mui/material";
import React, { useMemo } from "react";
import { parseMentions, highlightMentions } from "../../helpers/mentions";

function ChatInput({ message, setMessage, sendMessage, users = [] }) {
        const theme = useTheme();
        const mentions = useMemo(() => parseMentions(message, users), [message, users]);
        const highlighted = useMemo(() => highlightMentions(message, mentions), [message, mentions]);

        return (
                <Box
                        sx={{
                                display: "flex",
                                flexDirection: "row",
                                gap: theme.spacing(1),
                                justifyContent: "space-between",
                                padding: theme.spacing(1),
                        }}>
                        <div style={{ width: "100%", position: "relative" }}>
                                <form
                                        onSubmit={(event) => {
                                                event.preventDefault();
                                                sendMessage();
                                        }}>
                                        <TextField
                                                variant="outlined"
                                                size="small"
                                                fullWidth
                                                label="Type your message"
                                                value={message}
                                                onChange={(e) => {
                                                        setMessage(e.currentTarget.value);
                                                }}
                                                InputProps={{
                                                        sx: { position: "relative", backgroundColor: "transparent" },
                                                        style: { color: "transparent" },
                                                }}
                                                sx={{ position: "relative", zIndex: 1, backgroundColor: "transparent" }}
                                        />
                                        <Box
                                                aria-hidden
                                                sx={{
                                                        position: "absolute",
                                                        left: 14,
                                                        top: 20,
                                                        right: 14,
                                                        bottom: 0,
                                                        pointerEvents: "none",
                                                        whiteSpace: "pre-wrap",
                                                        color: theme.palette.text.primary,
                                                }}>
                                                {highlighted.map((p) => (
                                                        <span
                                                                key={p.key}
                                                                style={p.mention ? { backgroundColor: theme.palette.warning.main, color: theme.palette.common.white, padding: "0 2px" } : {}}>
                                                                {p.text}
                                                        </span>
                                                ))}
                                        </Box>
                                </form>
                        </div>
			<Button
				sx={{ height: "100%", margin: "auto" }}
				variant="contained"
				color="primary"
				onClick={sendMessage}
				endIcon={<Send sx={{ color: "rgba(0, 0, 0, 0.52)" }} style={{ fontSize: "26px" }} />}>
				Send
			</Button>
		</Box>
	);
}

export default ChatInput;
