import React, { useContext, useState, useRef } from "react";
import { Box, Avatar, IconButton, Typography, Paper, Dialog, DialogTitle, DialogContent, DialogActions, Button } from "@mui/material";
import CallEndIcon from "@mui/icons-material/CallEnd";
import CallIcon from "@mui/icons-material/Call";
import MicIcon from "@mui/icons-material/Mic";
import MicOffIcon from "@mui/icons-material/MicOff";
import VoiceChatContext from "../context/VoiceChatContext";
import { useSelector, useDispatch } from "react-redux";
import { callEnded } from "../slices/voiceChatSlice";
import { useLocation } from "react-router-dom";
import useFriendProfiles from "../helpers/useFriendProfiles";

export default function VoiceChatOverlay() {
	const location = useLocation();
	const dispatch = useDispatch();
	const voiceChat = useContext(VoiceChatContext);
	const { incoming, currentCallId, calls } = useSelector((s) => s.voiceChat);
	const myId = useSelector((s) => s.auth.user?.id);
	const friends = useFriendProfiles();

	const [pos, setPos] = useState({ x: window.innerWidth - 220, y: window.innerHeight - 140 });
	const dragRef = useRef(null);

	const handlePointerDown = (e) => {
		dragRef.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
		window.addEventListener("pointermove", handlePointerMove);
		window.addEventListener("pointerup", handlePointerUp);
	};
	const handlePointerMove = (e) => {
		setPos({ x: e.clientX - dragRef.current.x, y: e.clientY - dragRef.current.y });
	};
	const handlePointerUp = () => {
		window.removeEventListener("pointermove", handlePointerMove);
		window.removeEventListener("pointerup", handlePointerUp);
	};

	const currentCall = currentCallId ? calls[currentCallId] : null;
	const otherId = currentCall && (currentCall.callerId === myId ? currentCall.calleeId : currentCall.callerId);
	const other = friends.find((f) => f.id === otherId);

	if (location.pathname === "/voicechat") return null;

	if (incoming) {
		return (
			<Dialog open>
				<DialogTitle>Incoming Call</DialogTitle>
				<DialogContent>
					<Typography>{incoming.callerId} is calling...</Typography>
				</DialogContent>
				<DialogActions>
					<Button color="error" onClick={() => voiceChat.endCall(incoming.callId)} startIcon={<CallEndIcon />}>
						Decline
					</Button>
					<Button onClick={() => voiceChat.acceptCall(incoming.callId)} startIcon={<CallIcon />}>
						Accept
					</Button>
				</DialogActions>
			</Dialog>
		);
	}

	if (!currentCall || currentCall.status === "ended") return null;

	return (
		<Box style={{ position: "fixed", top: pos.y, left: pos.x, zIndex: 1301 }}>
			<Paper elevation={8} sx={{ p: 1, width: 200 }} onPointerDown={handlePointerDown}>
				<Box sx={{ display: "flex", alignItems: "center" }}>
					<Avatar src={other?.avatarUrl} />
					<Typography sx={{ ml: 1, flexGrow: 1 }} noWrap>
						{(other && (other.displayName || other.username)) || otherId}
					</Typography>
					<IconButton
						onClick={() => {
							voiceChat.endCall(currentCallId);
							dispatch(callEnded({ callId: currentCallId }));
						}}
						size="small">
						<CallEndIcon color="error" />
					</IconButton>
				</Box>
				<Box sx={{ display: "flex", justifyContent: "center", mt: 1 }}>
					<IconButton onClick={voiceChat.toggleMute}>{currentCall.muted ? <MicOffIcon /> : <MicIcon />}</IconButton>
				</Box>
				{voiceChat.remoteStream && <audio autoPlay ref={(el) => el && (el.srcObject = voiceChat.remoteStream)} />}
			</Paper>
		</Box>
	);
}
