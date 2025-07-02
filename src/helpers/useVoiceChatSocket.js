import { useEffect, useCallback, useState, useRef } from "react";
import Peer from "simple-peer";
import { useDispatch, useSelector } from "react-redux";
import socketIoHelper from "./socket";
import { callStarted, incomingCall, callAccepted, callEnded, toggleMute } from "../slices/voiceChatSlice";
import { addSnackbar } from "../slices/snackbarSlice";

export default function useVoiceChatSocket() {
	const dispatch = useDispatch();
	const token = useSelector((s) => s.auth.token);
	const myId = useSelector((s) => s.auth.user?.id);
	const { currentCallId, calls } = useSelector((s) => s.voiceChat);

	const [localStream, setLocalStream] = useState(null);
	const [remoteStream, setRemoteStream] = useState(null);
	const [peer, setPeer] = useState(null);
	const pendingCallee = useRef(null);

	// Acquire microphone once
	useEffect(() => {
		navigator.mediaDevices
			.getUserMedia({ audio: true })
			.then(setLocalStream)
			.catch(() => {
				/* ignored */
			});
	}, []);

	// --- establish a single shared connection ---
	useEffect(() => {
		if (!token) return;

		// get existing or create new socket
		const socket = socketIoHelper.getSocket() ?? socketIoHelper.connectSocket(token);

		// attach per‑feature listeners once
		socket.on("incoming_call", (callId, callerId) => {
			dispatch(incomingCall({ callId, callerId, calleeId: myId }));
			dispatch(
				addSnackbar({
					snackbarMsg: "Incoming call",
					snackbarSeverity: "info",
					autoHideDuration: 2000,
				})
			);
		});
		socket.on("call_started", (callId) => {
			dispatch(
				callStarted({
					callId,
					callerId: myId,
					calleeId: pendingCallee.current,
				})
			);
			pendingCallee.current = null;
			dispatch(
				addSnackbar({
					snackbarMsg: "Calling...",
					snackbarSeverity: "info",
					autoHideDuration: 1000,
				})
			);
		});
		socket.on("call_accepted", (callId) => {
			dispatch(callAccepted({ callId }));
			dispatch(
				addSnackbar({
					snackbarMsg: "Call connected",
					snackbarSeverity: "success",
					autoHideDuration: 1500,
				})
			);
		});
		socket.on("voice_signal", (callId, signal) => {
			if (callId === currentCallId) peer?.signal(signal);
		});
		socket.on("call_ended", (callId) => {
			dispatch(callEnded({ callId }));
			dispatch(
				addSnackbar({
					snackbarMsg: "Call ended",
					snackbarSeverity: "warning",
					autoHideDuration: 1500,
				})
			);
		});

		return () => {
			socket.off("incoming_call");
			socket.off("call_started");
			socket.off("call_accepted");
			socket.off("voice_signal");
			socket.off("call_ended");
			// do *not* disconnect; other features may rely on the socket
		};
	}, [dispatch, token, myId]);

	// create or destroy peer based on call state
	useEffect(() => {
		const call = currentCallId ? calls[currentCallId] : null;
		if (!call || call.status !== "active" || !localStream) return;

		if (peer) return;

		const initiator = call.callerId === myId;
		const p = new Peer({ initiator, trickle: false, stream: localStream });
		p.on("signal", (data) => {
			socketIoHelper.getSocket()?.emit("voice_signal", currentCallId, data);
		});
		p.on("stream", (stream) => {
			setRemoteStream(stream);
		});
		setPeer(p);

		return () => {
			p.destroy();
			setPeer(null);
			setRemoteStream(null);
		};
	}, [currentCallId, calls, localStream, peer, myId]);

	// cleanup peer on call end
	useEffect(() => {
		if (!currentCallId && peer) {
			peer.destroy();
			setPeer(null);
			setRemoteStream(null);
		}
	}, [currentCallId, peer]);

	// ------- Action Creators (Client-to-Server) -------
	const startCall = useCallback((otherId) => {
		const socket = socketIoHelper.getSocket();
		if (!socket) return;
		pendingCallee.current = otherId;
		socket.emit("call_user", otherId);
	}, []);

	const acceptCall = useCallback((callId) => {
		socketIoHelper.getSocket()?.emit("accept_call", callId);
	}, []);

	const endCall = useCallback((callId) => {
		socketIoHelper.getSocket()?.emit("end_call", callId);
	}, []);

	const toggleMuteLocal = useCallback(() => {
		if (!localStream || !currentCallId) return;
		localStream.getAudioTracks().forEach((t) => {
			t.enabled = !t.enabled;
		});
		dispatch(toggleMute({ callId: currentCallId }));
	}, [localStream, currentCallId, dispatch]);

	return { startCall, acceptCall, endCall, toggleMute: toggleMuteLocal, remoteStream };
}
