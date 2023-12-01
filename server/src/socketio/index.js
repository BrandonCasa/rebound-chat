import { Server } from "socket.io";
import logger from "../logger.js";

class SocketBackend {
  constructor() {
    this.io = null;
  }

  startListening(sessionMiddleware) {
    this.io = new Server({
      path: "/socket.io",
      cors: {
        origin: "http://localhost:3000",
      },
    });

    this.initializeMiddleware(sessionMiddleware);
    this.initializeIoEvents();

    this.io.listen(3000);
  }

  stopListening() {
    this.io.close();
  }

  initializeMiddleware(sessionMiddleware) {
    this.io.use(function (socket, next) {
      sessionMiddleware(socket.request, {}, next);
    });
  }

  initializeIoEvents() {
    this.io.on("connection", (socket) => {
      this.onConnection(socket);
    });
  }

  onConnection(socket) {
    const userId = socket.request.session.passport;
    logger.info(`New Connection (ID): ${userId}`);
    socket.emit("connected");
  }
}

const socketBackend = new SocketBackend();

export { socketBackend as default };
