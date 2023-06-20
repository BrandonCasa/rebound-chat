import React, { useState, useEffect } from "react";
import { socket } from "helpers/socket";

function Chat() {
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState([]);
  const [currentRoom, setCurrentRoom] = useState(""); // ["room1", "room2"]
  const [isConnected, setIsConnected] = useState(socket.connected);

  useEffect(() => {
    if (!socket) return;

    function onConnect() {
      setIsConnected(true);
    }

    function onDisconnect() {
      setIsConnected(false);
    }

    function onMessage(msg) {
      setMessages((messages) => [...messages, msg]);
    }

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("message", onMessage);

    socket.connect();
    return () => {
      socket.disconnect();
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("message", onMessage);
    };
  }, []);

  const sendMessage = () => {
    if (message) {
      socket.emit("message", message);
      setMessage("");
    }
  };

  return (
    <div>
      <h1>Chat Room: {isConnected ? "Connection Established" : "No Connection"}</h1>
      {messages.map((msg, index) => (
        <p key={index}>{msg}</p>
      ))}
      <input type="text" value={message} onChange={(e) => setMessage(e.target.value)} />
      <button onClick={sendMessage}>Send</button>
      {message}
    </div>
  );
}

export default Chat;
