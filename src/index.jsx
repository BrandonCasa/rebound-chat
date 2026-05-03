import React from "react";
import ReactDOM from "react-dom/client";

import { Provider } from "react-redux";

import App from "./App";
import reportWebVitals from "./reportWebVitals";

import "@fontsource/roboto/300.css";
import "@fontsource/roboto/400.css";
import "@fontsource/roboto/500.css";
import "@fontsource/roboto/700.css";

import "./index.css";

import store from "./store";

window.isElectron = "electronAPI" in window;
let ffmpegPath = await window.electronAPI.system.getFfmpegPath();
ffmpegPath = ffmpegPath.replace("app.asar", "app.asar.unpacked");
ffmpegPath = ffmpegPath.replace("app.asar.unpacked.unpacked", "app.asar.unpacked");
window.ffmpegPath = ffmpegPath;

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

if ("serviceworker" in navigator) {
	window.addEventListener("load", () => {
		navigator.serviceWorker.register("/sw.js").catch((err) => {
			console.error("Service worker registration failed", err);
		});
	});
}
