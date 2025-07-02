import { useEffect, useCallback } from "react";
import { useDispatch, useSelector } from "react-redux";
import socketIoHelper from "./socket";
import { callStarted, incomingCall, callAccepted, callEnded } from "../slices/voiceChatSlice";

export default function useVoiceChatSocket() {
	const dispatch = useDispatch();
	const token = useSelector((s) => s.auth.token); // adjust selector to your auth slice
	const myId = useSelector((s) => s.auth.user?.id);
	const { currentCallId } = useSelector((s) => s.voiceChat);

	// --- establish a single shared connection ---
	useEffect(() => {
		if (!token) return;

		// get existing or create new socket
		const socket = socketIoHelper.getSocket() ?? socketIoHelper.connectSocket(token);

		// attach per‑feature listeners once
		socket.on("incoming_call", (callId, callerId) => {
			dispatch(incomingCall({ callId, callerId, calleeId: myId }));
		});
		socket.on("call_started", (callId) => {
			// no state change needed; handled optimistically in startCall()
		});
		socket.on("call_accepted", (callId) => {
			dispatch(callAccepted({ callId }));
		});
		socket.on("call_ended", (callId) => {
			dispatch(callEnded({ callId }));
		});

		return () => {
			socket.off("incoming_call");
			socket.off("call_started");
			socket.off("call_accepted");
			socket.off("call_ended");
			// do *not* disconnect; other features may rely on the socket
		};
	}, [dispatch, token, myId]);

	// ------- Action Creators (Client-to-Server) -------
	const startCall = useCallback((otherId) => {
		const socket = socketIoHelper.getSocket();
		if (!socket) return;
		socket.emit("call_user", otherId);
	}, []);

	const acceptCall = useCallback((callId) => {
		socketIoHelper.getSocket()?.emit("accept_call", callId);
	}, []);

	const endCall = useCallback((callId) => {
		socketIoHelper.getSocket()?.emit("end_call", callId);
	}, []);

	return { startCall, acceptCall, endCall };
}
