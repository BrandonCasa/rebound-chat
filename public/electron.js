const electron = require("electron");
const app = electron.app;
const BrowserWindow = electron.BrowserWindow;

const path = require("path");
const url = require("url");

let mainWindow;

function createWindow() {
	mainWindow = new BrowserWindow({ width: 900, height: 680 });

	mainWindow.loadURL(isDev ? "http://localhost:3000" : `file://${path.join(__dirname, "index.html")}`);

	mainWindow.on("closed", () => (mainWindow = null));
}

function isDev() {
	return app.isPackaged;
}

app.on("ready", createWindow);

app.on("window-all-closed", () => {
	app.quit();
});

app.on("activate", () => {
	if (mainWindow === null) {
		createWindow();
	}
});
