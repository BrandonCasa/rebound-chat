function initiateSocketIO(io) {
  let users = {};

  const emitMessage = (room, loggedIn, username, displayName, messageText) => {
    io.to(room).emit("message", { loggedIn, username, displayName, messageText });
  };

  io.on("connection", (socket) => {
    socket.on("join", ({ loggedIn, username, displayName, room }) => {
      socket.join(room);

      // store the username and room associated with this client
      users[socket.id] = { loggedIn, username, displayName, room };

      // send users list to all clients in the room
      const usersInRoom = Object.values(users).filter((user) => user.room === room);
      io.to(room).emit("roomData", { users: usersInRoom });

      // broadcast a message to the room that a new user has joined
      // socket.broadcast.to(room).emit("message", { user: `System`, text: `${username}, entered the room!` });
      emitMessage(room, false, "System", "System", `${displayName}, entered the room.`);
    });

    socket.on("sendMessage", (message, callback) => {
      const { loggedIn, username, displayName, room } = users[socket.id];

      // send the message to all clients in the room
      emitMessage(room, loggedIn, username, displayName, message);

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
    });
  });
}

module.exports = { initiateSocketIO };
