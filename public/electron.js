const { app, BrowserWindow } = require("electron");
const path = require("path");

let mainWindow;

async function createWindow() {
	const { default: isDev } = await import("electron-is-dev");

	mainWindow = new BrowserWindow({
		width: 900,
		height: 680,
		webPreferences: {
			nodeIntegration: true,
			contextIsolation: false,
		},
	});

	if (isDev) {
		mainWindow.loadURL("http://localhost:3000");
	} else {
		mainWindow.loadURL("https://rebound.nexus");
	}

	mainWindow.on("closed", () => {
		mainWindow = null;
	});
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
	if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
	if (mainWindow === null) createWindow();
});
