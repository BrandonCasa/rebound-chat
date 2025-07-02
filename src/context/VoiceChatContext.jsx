import { createContext } from "react";

const VoiceChatContext = createContext({
  startCall: () => {},
  acceptCall: () => {},
  endCall: () => {},
  toggleMute: () => {},
  remoteStream: null,
});

export default VoiceChatContext;
