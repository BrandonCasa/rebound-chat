import { createSlice } from "@reduxjs/toolkit";

const initialState = {
        calls: {}, // callId -> { callerId, calleeId, status, muted }
        currentCallId: null,
        incoming: null,
};

const voiceChatSlice = createSlice({
	name: "voiceChat",
	initialState,
	reducers: {
                callStarted(state, { payload: { callId, callerId, calleeId } }) {
                        state.calls[callId] = { callerId, calleeId, status: "ringing", muted: false };
                        state.currentCallId = callId;
                },
                incomingCall(state, { payload: { callId, callerId, calleeId } }) {
                        state.calls[callId] = { callerId, calleeId, status: "ringing", muted: false };
                        state.incoming = { callId, callerId };
                },
		callAccepted(state, { payload: { callId } }) {
			if (state.calls[callId]) state.calls[callId].status = "active";
			state.incoming = null;
			state.currentCallId = callId;
		},
                callEnded(state, { payload: { callId } }) {
                        if (state.calls[callId]) state.calls[callId].status = "ended";
                        if (state.currentCallId === callId) state.currentCallId = null;
                        if (state.incoming?.callId === callId) state.incoming = null;
                },
                toggleMute(state, { payload: { callId } }) {
                        if (state.calls[callId]) state.calls[callId].muted = !state.calls[callId].muted;
                },
                resetVoiceChat: () => initialState,
        },
});

export const { callStarted, incomingCall, callAccepted, callEnded, toggleMute, resetVoiceChat } = voiceChatSlice.actions;
export default voiceChatSlice.reducer;
