import { io } from "socket.io-client";

class SocketIoHelper {
  constructor() {
    this.socketURL = process.env.NODE_ENV === "production" ? undefined : "http://localhost:6002";
    this.socketClient = null;
  }

  connectSocket(userToken) {
    this.socketClient = io(this.socketURL, {
      autoConnect: true,
      query: { token: userToken },
    });

    return this.socketClient;
  }

  disconnectSocket() {
    this.socketClient.disconnect();
  }

  getSocket() {
    return this.socketClient;
  }
}

const socketIoHelper = new SocketIoHelper();

export { socketIoHelper as default };
