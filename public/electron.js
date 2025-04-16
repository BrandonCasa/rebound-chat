const { app, BrowserWindow, dialog } = require("electron");
const { autoUpdater } = require("electron-updater");
const log = require("electron-log");
const path = require("path");

let mainWindow;

async function createWindow() {
	// Dynamically import the ES module "electron-is-dev"
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
		const indexPath = path.join(__dirname, "index.html");
		mainWindow.loadFile(indexPath);
		mainWindow.webContents.openDevTools();
		autoUpdater.checkForUpdates();
	}

	mainWindow.on("closed", () => {
		mainWindow = null;
	});
}

autoUpdater.logger = log;
log.transports.file.level = "info";

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
	log.error("Error in auto-updater: " + err);
});

autoUpdater.on("download-progress", (progressObj) => {
	let logMessage = "Download speed: " + progressObj.bytesPerSecond;
	logMessage += " - Downloaded " + progressObj.percent + "%";
	logMessage += " (" + progressObj.transferred + "/" + progressObj.total + ")";
	log.info(logMessage);
});

autoUpdater.on("update-downloaded", (info) => {
	const dialogOpts = {
		type: "info",
		buttons: ["Restart", "Later"],
		title: "Update Available",
		message: "A new version has been downloaded.",
		detail: "Do you want to restart the application and install the updates now?",
	};

	dialog.showMessageBox(dialogOpts).then((returnValue) => {
		if (returnValue.response === 0) {
			autoUpdater.quitAndInstall();
		}
	});
});

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
	if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
	if (mainWindow === null) createWindow();
});
