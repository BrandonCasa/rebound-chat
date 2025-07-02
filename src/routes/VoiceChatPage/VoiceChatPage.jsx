import React, { useContext } from "react";
import {
	Box,
	Typography,
	List,
	ListItem,
	ListItemAvatar,
	Avatar,
	ListItemText,
	IconButton,
	Dialog,
	DialogTitle,
	DialogContent,
	DialogActions,
	Button,
	Grid,
	Stack,
	Divider,
} from "@mui/material";
import CallIcon from "@mui/icons-material/Call";
import CallEndIcon from "@mui/icons-material/CallEnd";
import MicOffIcon from "@mui/icons-material/MicOff";
import MicIcon from "@mui/icons-material/Mic";
import VolumeUpIcon from "@mui/icons-material/VolumeUp";
import { useSelector, useDispatch } from "react-redux";
import VoiceChatContext from "../../context/VoiceChatContext";
import { callEnded } from "../../slices/voiceChatSlice";
import useFriendProfiles from "../../helpers/useFriendProfiles";

export default function VoiceChatPage() {
	const { startCall, acceptCall, endCall, toggleMute, remoteStream } = useContext(VoiceChatContext);
	const dispatch = useDispatch();
	const { incoming, currentCallId, calls } = useSelector((s) => s.voiceChat);
	const myId = useSelector((s) => s.auth.user?.id);
	const friends = useFriendProfiles();

	const currentCall = currentCallId ? calls[currentCallId] : null;
	const otherId = currentCall && (currentCall.callerId === myId ? currentCall.calleeId : currentCall.callerId);
	const other = friends.find((f) => f.id === otherId);

	const handleStartCall = (friendId) => {
		startCall(friendId);
	};

	return (
		<Grid container sx={{ height: "100vh" }}>
			{/* Friends Sidebar */}
			<Grid item xs={2} sx={{ borderRight: 1, borderColor: "divider", p: 2 }}>
				<Typography variant="h6" gutterBottom>
					Friends
				</Typography>
				<List disablePadding sx={{ height: "80vh", overflowY: "auto" }}>
					{friends.map((f) => (
						<ListItem
							key={f.id}
							secondaryAction={
								<IconButton onClick={() => handleStartCall(f.id)} disabled={!!currentCallId}>
									<CallIcon />
								</IconButton>
							}
							sx={{ borderRadius: 1, mb: 1 }}>
							<ListItemAvatar>
								<Avatar src={f.avatarUrl} />
							</ListItemAvatar>
							<ListItemText primary={f.displayName || f.username} />
						</ListItem>
					))}
				</List>
			</Grid>

			{/* Chat Area */}
			<Grid item xs={currentCallId ? 6 : 10} sx={{ p: 2 }}>
				<Box id="chat-area" sx={{ height: "100%", borderRadius: 1, p: 2, overflowY: "auto", bgcolor: "background.paper" }}>
					{/* Insert Chat component here */}
				</Box>
			</Grid>

			{/* Call Panel - appears only when in a call */}
			{currentCallId && currentCall?.status !== "ended" && (
				<Grid item xs={4} sx={{ borderLeft: 1, borderColor: "divider", p: 2 }}>
					<Typography variant="h6" gutterBottom>
						In Call
					</Typography>
					<Stack spacing={2}>
						<Stack direction="row" spacing={1} alignItems="center">
							<Avatar src={other?.avatarUrl} />
							<Typography>{other?.displayName || otherId}</Typography>
						</Stack>
						<Divider />
						{/* Controls */}
						<Stack direction="row" spacing={2} justifyContent="center">
							<IconButton onClick={toggleMute}>{currentCall?.muted ? <MicOffIcon /> : <MicIcon />}</IconButton>
							<IconButton
								onClick={() => {
									endCall(currentCallId);
									dispatch(callEnded({ callId: currentCallId }));
								}}
								color="error">
								<CallEndIcon />
							</IconButton>
							<IconButton>
								<VolumeUpIcon />
							</IconButton>
						</Stack>
						{remoteStream && (
							<audio
								autoPlay
								ref={(el) => {
									if (el) el.srcObject = remoteStream;
								}}
							/>
						)}
					</Stack>
				</Grid>
			)}

			{/* Incoming Call Dialog */}
			{incoming && (
				<Dialog open>
					<DialogTitle>Incoming Call</DialogTitle>
					<DialogContent>
						<Typography>{incoming.callerId} is calling...</Typography>
					</DialogContent>
					<DialogActions>
						<Button color="error" onClick={() => endCall(incoming.callId)} startIcon={<MicOffIcon />}>
							Decline
						</Button>
						<Button onClick={() => acceptCall(incoming.callId)} startIcon={<CallIcon />}>
							Accept
						</Button>
					</DialogActions>
				</Dialog>
			)}
		</Grid>
	);
}
