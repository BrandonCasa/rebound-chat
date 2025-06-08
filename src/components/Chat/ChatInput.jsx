import Send from "@mui/icons-material/Send";
import { TextField, Button, useTheme, Box } from "@mui/material";
import React from "react";

function ChatInput({ message, setMessage, sendMessage }) {
	const theme = useTheme();

	return (
		<Box
			sx={{
				display: "flex",
				flexDirection: "row",
				gap: theme.spacing(1),
				justifyContent: "space-between",
				padding: theme.spacing(1),
			}}>
			<div style={{ width: "100%" }}>
				<form
					onSubmit={(event) => {
						event.preventDefault();
						sendMessage();
					}}>
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
