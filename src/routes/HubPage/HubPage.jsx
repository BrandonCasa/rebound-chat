import { Box, Divider, List, ListItemButton, ListItemText, ListSubheader, Paper, Typography } from "@mui/material";
import { styled } from "@mui/material/styles";
import Grid from "@mui/material/Unstable_Grid2";

import React, { useState } from "react";

import ChatArea from "components/Chat/ChatArea";
import ChatInput from "components/Chat/ChatInput";

function ChatList({ currentChatRoom, setCurrentChatRoom, setMessages }) {
	return (
		<Paper
			sx={{
				width: "100%",
				height: "100%",
				overflow: "scroll",
				flexGrow: 1,
				minHeight: "175px",
			}}>
			<List
				sx={{
					width: "100%",
					height: "100%",
					bgcolor: "background.paper",
					flexGrow: 1,
					"& ul": { padding: 0 },
				}}
				subheader={<li />}>
				{["Favorites", "Overwatch", "Valorant"].map((chatGroup) => (
					<li key={`group-${chatGroup}`}>
						<ul>
							<ListSubheader>{`${chatGroup}`}</ListSubheader>
							{["phantompigz", "future_wizard", "Ranahan"].map((chatName) => (
								<ListItemButton
									selected={chatName == currentChatRoom}
									key={`chat-${chatGroup}-${chatName}`}
									onClick={() => {
										setMessages([]);
										setCurrentChatRoom(chatName);
									}}>
									<ListItemText sx={{ ml: 3 }} primary={`${chatName}`} />
								</ListItemButton>
							))}
						</ul>
					</li>
				))}
			</List>
		</Paper>
	);
}

const Item = styled(Paper)(({ theme }) => ({
	...theme.typography.body2,
	padding: theme.spacing(1),
	textAlign: "center",
	color: theme.palette.text.secondary,
}));

function HubPage() {
	const [message, setMessage] = useState("");
	const [messages, setMessages] = useState([]);
	const [currentChatRoom, setCurrentChatRoom] = useState("phantompigz");

	/* 
  useEffect(() => {
    socket.emit("join", { username: authState.loggedIn ? authState.displayName : `User-${Math.round(Math.random() * 1000 + 1)}`, room: currentChatRoom });

    socket.on("message", (message) => {
      setMessages((messages) => [...messages, message]);
    });

    socket.on("roomData", ({ users }) => {
      setUsers(users);
    });

    return () => {
      socket.off("message");
      //socket.off("roomData");
    };
  }, [currentChatRoom, authState.loggedIn]);
  */

	const sendMessage = (event) => {
		if (event) event.preventDefault();

		if (message) {
			//socket.emit("sendMessage", message, () => setMessage(""));
		}
	};

	return (
		<Box
			sx={{
				display: "flex",
				justifyContent: "center",
				flexGrow: 1,
				overflow: "hidden",
			}}>
			<Grid container spacing={2} sx={{ flexGrow: 1 }}>
				<Grid xs={12} sm={4.75} md={3} sx={{ height: "100%" }}>
					<ChatList currentChatRoom={currentChatRoom} setCurrentChatRoom={setCurrentChatRoom} setMessages={setMessages} />
				</Grid>
				<Grid sm={7.25} md={9}>
					<Item sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
						<Typography align="center" variant="h5">
							{currentChatRoom}
						</Typography>
						<Divider />
						<Box sx={{ width: "100%", flexGrow: 1, position: "relative", mb: 1 }}>
							<ChatArea messages={messages} />
						</Box>
						<ChatInput message={message} setMessage={setMessage} sendMessage={sendMessage} />
					</Item>
				</Grid>
			</Grid>
		</Box>
	);
}

export default HubPage;
