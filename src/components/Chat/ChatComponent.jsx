import React, { useState, useEffect } from "react";
import socketIOClient from "socket.io-client";

const Chat = () => {
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState([]);
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    if (!process.env.NODE_ENV || process.env.NODE_ENV === "development") {
      const newSocket = socketIOClient("http://localhost:6001/", { transports: ["websocket", "polling"], path: "/socket.io" });
      setSocket(newSocket);
    } else {
      const newSocket = socketIOClient({ transports: ["websocket", "polling"], path: "/socket.io" });
      setSocket(newSocket);
    }

    return () => socket.disconnect();
  }, [setSocket]);

  useEffect(() => {
    if (!socket) return;

    socket.on("message", (msg) => {
      setMessages((messages) => [...messages, msg]);
    });
  }, [socket]);

  const sendMessage = () => {
    if (message) {
      socket.emit("message", "room1", message); // replace 'room1' with your room name
      setMessage("");
    }
  };

  return (
    <div>
      <h1>Chat</h1>
      {messages.map((msg, index) => (
        <p key={index}>{msg}</p>
      ))}
      <input type="text" value={message} onChange={(e) => setMessage(e.target.value)} />
      <button onClick={sendMessage}>Send</button>
      {message}
    </div>
  );
};

export default Chat;
