import { io } from "socket.io-client";

let socketInstance = null;
let socketMeta = { url: null };

export const getSocketClient = () => socketInstance;
export const getSocketMeta = () => socketMeta;

export const initSocketClient = (url) => {
	if (!url) return null;

	if (socketInstance && socketMeta.url === url) {
		if (!socketInstance.connected && !socketInstance.connecting) {
			socketInstance.connect();
		}
		return socketInstance;
	}

	if (socketInstance) {
		try {
			socketInstance.disconnect();
			socketInstance.close?.();
		} catch (err) {
			console.error("Error closing existing socket", err);
		}
	}

	socketInstance = io(url, {
		autoConnect: true,
		transports: ["websocket"],
		withCredentials: true,
	});
	socketMeta = { url };
	return socketInstance;
};

export const tearDownSocketClient = () => {
	if (!socketInstance) return;
	try {
		socketInstance.removeAllListeners?.();
		socketInstance.disconnect();
		socketInstance.close?.();
	} catch (err) {
		console.error("Error tearing down socket", err);
	}
	socketInstance = null;
	socketMeta = { url: null };
};
