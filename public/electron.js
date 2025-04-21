const path = require("path");

const { app, BrowserWindow, ipcMain } = require("electron");
const log = require("electron-log");
const { autoUpdater } = require("electron-updater");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let mainWindow;

autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;

function sendStatus(channel, payload = {}) {
	if (mainWindow && mainWindow.webContents) {
		mainWindow.webContents.send(channel, payload);
	}
}

async function createWindow() {
	const { default: isDev } = await import("electron-is-dev");

	const preloadPath = path.join(__dirname, "preload.js");

	mainWindow = new BrowserWindow({
		width: 1280,
		height: 720,
		webPreferences: {
			nodeIntegration: false,
			contextIsolation: true,
			preload: preloadPath,
		},
	});

	if (isDev) {
		mainWindow.loadURL("http://localhost:3000");
	} else {
		const indexPath = path.join(__dirname, "index.html");
		mainWindow.loadFile(indexPath);
		//mainWindow.webContents.openDevTools();
		//autoUpdater.checkForUpdates();
	}

	mainWindow.on("closed", () => {
		mainWindow = null;
	});
}

autoUpdater.logger = log;
log.transports.file.level = "info";

ipcMain.on("check-for-updates", () => {
	autoUpdater.checkForUpdates();
});

ipcMain.on("download-update", () => {
	autoUpdater.downloadUpdate();
});

ipcMain.on("install-update", () => {
	autoUpdater.quitAndInstall(true, true);
});

autoUpdater.on("checking-for-update", () => {
	log.info("Checking for update...");
	sendStatus("update-checking");
});

ipcMain.on("simulate-update", async () => {
	log.info("Simulating an update…");

	autoUpdater.emit("checking-for-update");

	await sleep(1000);

	autoUpdater.emit("update-available", { version: "SIMULATED", simulated: true });

	await sleep(2000);

	autoUpdater.emit("download-progress", {
		bytesPerSecond: 1024,
		percent: 25,
		transferred: 25,
		total: 100,
	});

	await sleep(2000);

	autoUpdater.emit("download-progress", {
		bytesPerSecond: 1024,
		percent: 75,
		transferred: 75,
		total: 100,
	});

	await sleep(2000);

	autoUpdater.emit("download-progress", {
		bytesPerSecond: 1024,
		percent: 100,
		transferred: 100,
		total: 100,
	});
	autoUpdater.emit("update-downloaded", { version: "SIMULATED", simulated: true });
});

autoUpdater.on("update-available", (info) => {
	log.info("Update available.", info);
	console.log(info);
	sendStatus("update-available", info);
});

autoUpdater.on("update-not-available", (info) => {
	log.info("No update available.", info);
	sendStatus("update-not-available", info);
});

autoUpdater.on("error", (err) => {
	log.error("Error in auto-updater:", err);
	sendStatus("update-error", { message: err == null ? "Unknown" : err.message });
});

autoUpdater.on("download-progress", (progressObj) => {
	let logMessage = "Download speed: " + progressObj.bytesPerSecond;
	logMessage += " - Downloaded " + progressObj.percent + "%";
	logMessage += " (" + progressObj.transferred + "/" + progressObj.total + ")";
	log.info(logMessage);
	sendStatus("download-progress", {
		percent: progressObj.percent,
	});
});

autoUpdater.on("update-downloaded", (info) => {
	log.info("Update downloaded", info);
	sendStatus("update-downloaded", info);
});

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
	if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
	if (mainWindow === null) createWindow();
});
