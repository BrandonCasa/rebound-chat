import { io } from "socket.io-client";

let socketInstance = null;
let socketMeta = { url: null, token: null };

export const getSocketClient = () => socketInstance;
export const getSocketMeta = () => socketMeta;

export const updateSocketAuthToken = (token) => {
	if (!socketInstance) return;
	socketMeta = { ...socketMeta, token: token ?? null };
};

export const initSocketClient = (url, token) => {
	if (!url) return null;

	if (socketInstance && socketMeta.url === url) {
		if (socketMeta.token !== token) {
			updateSocketAuthToken(token);
		}
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
	socketMeta = { url, token };
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
	socketMeta = { url: null, token: null };
};
