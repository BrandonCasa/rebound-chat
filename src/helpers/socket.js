import { io } from "socket.io-client";

const isElectron = typeof window !== "undefined" && window.process && window.process.versions != null && Boolean(window.process.versions.electron);

class SocketIoHelper {
	constructor() {
		this.socketURL = process.env.NODE_ENV === "production" ? undefined : "http://localhost:6002";
		this.socketURL = this.socketURL = isElectron ? "https://rebound.nexus/" : this.socketURL;
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
