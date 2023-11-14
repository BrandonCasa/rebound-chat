const chatRoomSuite = require("../routes/chatroom.js");
const ChatRoom = chatRoomSuite.ChatRoom;

function initiateSocketIO(io) {
  let users = {};

  const emitMessage = (room, loggedIn, username, displayName, messageText) => {
    io.to(room).emit("message", { loggedIn, username, displayName, messageText });
  };

  io.on("connection", (socket) => {
    socket.on("join", ({ loggedIn, username, displayName, room }) => {
      socket.join(room);

      chatRoomSuite.addRoom(room);

      // store the username and room associated with this client
      users[socket.id] = { loggedIn, username, displayName, room };

      // send users list to all clients in the room
      const usersInRoom = Object.values(users).filter((user) => user.room === room);
      io.to(room).emit("roomData", { users: usersInRoom });

      // broadcast a message to the room that a new user has joined
      // socket.broadcast.to(room).emit("message", { user: `System`, text: `${username}, entered the room!` });
      emitMessage(room, false, "System", "System", `${displayName}, entered the room.`);
      // chatRoomSuite.addMessage(room, "System", `${displayName}, entered the room.`); // move to use future system user
    });

    socket.on("sendMessage", (message, callback) => {
      const { loggedIn, username, displayName, room } = users[socket.id];

      // send the message to all clients in the room
      emitMessage(room, loggedIn, username, displayName, message);
      if (loggedIn) {
        // Should do it regardless but i need a way to fix anon and system users
        chatRoomSuite.addMessage(room, username, message);
      }

      callback(); // acknowledge that the message was sent
    });

    socket.on("disconnect", () => {
      if (!users[socket.id]) return;
      const { loggedIn, username, displayName, room } = users[socket.id];

      // remove this user from the users object
      delete users[socket.id];

      // send users list to all clients in the room
      const usersInRoom = Object.values(users).filter((user) => user.room === room);
      io.to(room).emit("roomData", { users: usersInRoom });

      // broadcast a message to the room that a user has left
      emitMessage(room, false, "System", "System", `${displayName}, left the room.`);
      // chatRoomSuite.addMessage(room, "System", `${displayName}, left the room.`); // move to use future system user
    });
  });
}

module.exports = { initiateSocketIO };
