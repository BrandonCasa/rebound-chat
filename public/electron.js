// main.mjs (or main.js with "type": "module" in package.json)

import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { app, BrowserWindow, ipcMain, protocol } from "electron";
import log from "electron-log";
import updater from "electron-updater";
const { autoUpdater } = updater;
import isDev from "electron-is-dev";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let mainWindow;

protocol.registerSchemesAsPrivileged([
	{
		scheme: "app",
		privileges: {
			standard: true,
			secure: true,
			supportFetchAPI: true,
			allowServiceWorkers: true,
			corsEnabled: true,
		},
	},
]);

if (process.platform === "win32") {
	app.setAppUserModelId("com.brandoncasa.rebound");
}

autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;

function sendStatus(channel, payload = {}) {
	if (mainWindow?.webContents) {
		mainWindow.webContents.send(channel, payload);
	}
}

function allowUpdateAction(actionName) {
	if (isDev) {
		log.warn(`Skipping ${actionName} while running in development.`);
		return false;
	}
	return true;
}

async function createWindow() {
	const preloadPath = join(__dirname, "preload.js");

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
		mainWindow.loadURL("app://-/index.html");
		// mainWindow.webContents.openDevTools();
		// autoUpdater.checkForUpdates();
	}

	mainWindow.on("closed", () => {
		mainWindow = null;
	});
}

// wire up IPC
ipcMain.on("check-for-updates", () => {
	if (!allowUpdateAction("check-for-updates")) return;
	autoUpdater.checkForUpdates();
});
ipcMain.on("download-update", () => {
	if (!allowUpdateAction("download-update")) return;
	autoUpdater.downloadUpdate();
});
ipcMain.on("install-update", () => {
	if (!allowUpdateAction("install-update")) return;
	autoUpdater.quitAndInstall(true, true);
});
ipcMain.on("simulate-update", async () => {
	log.info("Simulating an update…");
	autoUpdater.emit("checking-for-update");
	await sleep(1000);
	autoUpdater.emit("update-available", {
		version: "SIMULATED",
		simulated: true,
	});
	await sleep(2000);
	[25, 75, 100].forEach(async (pct, i) => {
		await sleep(2000 * i);
		autoUpdater.emit("download-progress", {
			bytesPerSecond: 1024,
			percent: pct,
			transferred: pct,
			total: 100,
		});
	});
	await sleep(6000);
	autoUpdater.emit("update-downloaded", {
		version: "SIMULATED",
		simulated: true,
	});
});

// autoUpdater → UI notifications
autoUpdater.logger = log;
log.transports.file.level = "info";

autoUpdater.on("checking-for-update", () => {
	log.info("Checking for update…");
	sendStatus("update-checking");
});
autoUpdater.on("update-available", (info) => {
	log.info("Update available.", info);
	sendStatus("update-available", info);
});
autoUpdater.on("update-not-available", (info) => {
	log.info("No update available.", info);
	sendStatus("update-not-available", info);
});
autoUpdater.on("error", (err) => {
	log.error("Error in auto-updater:", err);
	sendStatus("update-error", { message: err?.message ?? "Unknown" });
});
autoUpdater.on("download-progress", (progressObj) => {
	const msg = `Download speed: ${progressObj.bytesPerSecond} - Downloaded ${progressObj.percent}% (${progressObj.transferred}/${progressObj.total})`;
	log.info(msg);
	sendStatus("download-progress", { percent: progressObj.percent });
});
autoUpdater.on("update-downloaded", (info) => {
	log.info("Update downloaded", info);
	sendStatus("update-downloaded", info);
});

// boot
app.whenReady().then(async () => {
	protocol.registerFileProtocol("app", (request, callback) => {
		const url = new URL(request.url);
		const pathname = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
		const filePath = join(__dirname, decodeURIComponent(pathname));

		callback({
			path: filePath,
		});
	});

	await createWindow();
});

app.on("window-all-closed", () => {
	if (process.platform !== "darwin") app.quit();
});
app.on("activate", () => {
	if (mainWindow === null) createWindow();
});
