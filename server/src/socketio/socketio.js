const { Server } = require("socket.io");
const chatRoomSuite = require("../routes/chatroom.js");

const ChatRoom = chatRoomSuite.ChatRoom;

function initiateSocketIO(server) {
  const io = new Server(server, {
    path: "/socket.io",
    cors: {
      origin: "http://localhost:3000",
    },
  });

  let users = {};

  const emitMessage = (room, loggedIn, username, displayName, messageText, messageId) => {
    io.to(room).emit("message", { loggedIn, username, displayName, messageText, messageId });
  };

  io.on("connection", (socket) => {
    socket.on("join", async ({ loggedIn, username, displayName, room }) => {
      socket.join(room);
      await chatRoomSuite.addRoom(room);

      // store the username and room associated with this client
      users[socket.id] = { loggedIn, username, displayName, room };

      // send users list to all clients in the room
      const usersInRoom = Object.values(users).filter((user) => user.room === room);
      io.to(room).emit("roomData", { users: usersInRoom });

      let messageId = await chatRoomSuite.addMessage(room, "System", `${displayName}, entered the room.`);
      emitMessage(room, false, "System", "System", `${displayName}, entered the room.`, messageId);
    });

    socket.on("leave", (room, callback) => {
      socket.leave(room);

      delete users[socket.id];

      const usersInRoom = Object.values(users).filter((user) => user.room === room);
      io.to(room).emit("roomData", { users: usersInRoom });

      callback();
    });

    socket.on("disconnecting", () => {
      socket.rooms.forEach((room) => {
        socket.leave(room);
      })
    });

    socket.on("sendMessage", async (message, callback) => {
      if (users[socket.id] === undefined) return;
      const { loggedIn, username, displayName, room } = users[socket.id];

      // send the message to all clients in the room
      let messageId = await chatRoomSuite.addMessage(room, username, message);
      emitMessage(room, loggedIn, username, displayName, message, messageId);

      callback(); // acknowledge that the message was sent
    });

    socket.on("loadMessages", async (startFromId, callback) => {
      if (users[socket.id] === undefined) return;
      const { loggedIn, username, displayName, room } = users[socket.id];


      let messages = await chatRoomSuite.retrieveMessages(room, startFromId);

      socket.emit("messagesRetrieved", { messages: messages, mergeOn: startFromId });

      callback(); // acknowledge that the message was sent
    });

    socket.on("disconnect", async () => {
      if (!users[socket.id]) return;
      const { loggedIn, username, displayName, room } = users[socket.id];

      // remove this user from the users object
      delete users[socket.id];

      // send users list to all clients in the room
      const usersInRoom = Object.values(users).filter((user) => user.room === room);
      io.to(room).emit("roomData", { users: usersInRoom });

      let messageId = await chatRoomSuite.addMessage(room, "System", `${displayName}, left the room.`);
      emitMessage(room, false, "System", "System", `${displayName}, left the room.`, messageId);
    });

    socket.on("close", async (reason) => {
      if (!users[socket.id]) return;
      const { loggedIn, username, displayName, room } = users[socket.id];

      // remove this user from the users object
      delete users[socket.id];

      // send users list to all clients in the room
      const usersInRoom = Object.values(users).filter((user) => user.room === room);
      io.to(room).emit("roomData", { users: usersInRoom });

      let messageId = await chatRoomSuite.addMessage(room, "System", `${displayName}, left the room.`);
      emitMessage(room, false, "System", "System", `${displayName}, left the room.`, messageId);
    });
  });
}

module.exports = { initiateSocketIO };
