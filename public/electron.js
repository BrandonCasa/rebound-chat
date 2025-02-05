const { electron, dialog } = require("electron");
const app = electron.app;
const BrowserWindow = electron.BrowserWindow;

const path = require("path");
const url = require("url");

let mainWindow;

function createWindow() {
	mainWindow = new BrowserWindow({ width: 900, height: 680 });

	if (isDev) {
		mainWindow.loadURL("http://localhost:3000");
	} else {
		dialog.showErrorBox("HTML File Path", `file://${path.join(__dirname, "../build/index.html")}`);
		mainWindow.loadFile(`file://${path.join(__dirname, "../build/index.html")}`);
	}

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
