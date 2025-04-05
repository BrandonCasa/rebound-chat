const { app, BrowserWindow } = require("electron");
const { autoUpdater } = require("electron-updater");
const log = require("electron-log");
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
		autoUpdater.checkForUpdatesAndNotify();
	}

	mainWindow.on("closed", () => {
		mainWindow = null;
	});
}

autoUpdater.logger = log;
autoUpdater.logger.transports.file.level = "info";

autoUpdater.on("checking-for-update", () => {
	log.info("Checking for update...");
});

autoUpdater.on("update-available", (info) => {
	log.info("Update available.", info);
});

autoUpdater.on("update-not-available", (info) => {
	log.info("Update not available.", info);
});

autoUpdater.on("error", (err) => {
	log.error("Error in auto-updater. " + err);
});

autoUpdater.on("download-progress", (progressObj) => {
	let log_message = "Download speed: " + progressObj.bytesPerSecond;
	log_message = log_message + " - Downloaded " + progressObj.percent + "%";
	log_message = log_message + " (" + progressObj.transferred + "/" + progressObj.total + ")";
	log.info(log_message);
});

autoUpdater.on("update-downloaded", (info) => {
	log.info("Update downloaded", info);
	autoUpdater.quitAndInstall();
});

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
	if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
	if (mainWindow === null) createWindow();
});
