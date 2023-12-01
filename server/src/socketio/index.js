import { Server } from "socket.io";
import logger from "../logger.js";

class SocketBackend {
  constructor() {
    this.io = null;
  }

  startListening() {
    this.io = new Server({
      path: "/socket.io",
      cors: {
        origin: "http://localhost:3000",
      },
    });

    this.initializeIoEvents();

    this.io.listen(3000);
  }

  stopListening() {
    this.io.close();
  }

  initializeIoEvents() {
    this.io.on("connection", (socket) => {
      this.onConnection(socket);
    });
  }

  onConnection(socket) {
    socket.emit("connected");
  }
}

const socketBackend = new SocketBackend();

export { socketBackend as default };
