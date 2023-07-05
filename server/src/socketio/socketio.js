function initiateSocketIO(io) {
  let users = {};

  io.on("connection", (socket) => {
    socket.on("join", ({ username, room }) => {
      socket.join(room);

      // store the username and room associated with this client
      users[socket.id] = { username, room };

      // send users list to all clients in the room
      const usersInRoom = Object.values(users).filter((user) => user.room === room);
      io.to(room).emit("roomData", { users: usersInRoom });

      // broadcast a message to the room that a new user has joined
      socket.broadcast.to(room).emit("message", { user: `System`, text: `${username}, has entered the chat!` });
    });

    socket.on("sendMessage", (message, callback) => {
      const { username, room } = users[socket.id];

      // send the message to all clients in the room
      io.to(room).emit("message", { user: username, text: message });

      callback(); // acknowledge that the message was sent
    });

    socket.on("disconnect", () => {
      if (!users[socket.id]) return;
      const { username, room } = users[socket.id];

      // remove this user from the users object
      delete users[socket.id];

      // send users list to all clients in the room
      const usersInRoom = Object.values(users).filter((user) => user.room === room);
      io.to(room).emit("roomData", { users: usersInRoom });

      // broadcast a message to the room that a user has left
      io.to(room).emit("message", { user: `System`, text: `${username}, exited the chat.` });
    });
  });
}

module.exports = { initiateSocketIO };
