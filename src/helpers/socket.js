import { io } from "socket.io-client";

class SocketIoHelper {
	constructor() {
		this.socketURL = process.env.NODE_ENV === "development" ? `http://localhost:6002` : globalThis.IN_ELECTRON_ENV ? `https://rebound.nexus` : "";
		this.socketClient = null;
	}

	connectSocket(userToken) {
		//console.log(userToken);
		this.socketClient = io(this.socketURL, {
			autoConnect: true,
			extraHeaders: {
				Authorization: `Bearer ${userToken}`,
			},
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
