import React from "react";
import ReactDOM from "react-dom/client";

import { Provider } from "react-redux";

import App from "./App";
import reportWebVitals from "./reportWebVitals";

import "./index.css";

import store from "./store";

window.isElectron = "electronAPI" in window;

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
	<Provider store={store}>
		<App />
	</Provider>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();

const canUseServiceWorker = () => {
	if (!("serviceWorker" in navigator)) {
		return false;
	}

	if (window.isSecureContext) {
		return true;
	}

	if (window.location.protocol === "file:" && window.isElectron) {
		console.warn("Service workers are not available for file:// URLs in Electron. Serve the app over a secure or custom protocol to enable sw.js.");
		return false;
	}

	console.warn("Service workers require a secure context; skipping registration.");
	return false;
};

if (canUseServiceWorker()) {
	window.addEventListener("load", () => {
		navigator.serviceWorker.register("/sw.js").catch((err) => {
			console.error("Service worker registration failed", err);
		});
	});
}
