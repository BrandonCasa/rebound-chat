// main.mjs (or main.js with "type": "module" in package.json)

import { fileURLToPath } from "url";
import { dirname, extname, join } from "path";
import { readFile } from "fs/promises";
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
	mainWindow = new BrowserWindow({
		width: 1280,
		height: 720,
		webPreferences: {
			nodeIntegration: false,
			contextIsolation: true,
			preload: join(__dirname, "preload.js"),
		},
	});

	// Helpful when diagnosing protocol issues:
	mainWindow.webContents.on("did-fail-load", (_e, code, desc, url) => {
		log.error("did-fail-load", { code, desc, url });
	});

	if (isDev) {
		await mainWindow.loadURL("http://localhost:3000");
	} else {
		await mainWindow.loadURL("app://-/index.html");
	}
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

app.whenReady().then(async () => {
	const mimeByExt = {
		".js": "application/javascript",
		".mjs": "application/javascript",
		".css": "text/css",
		".html": "text/html",
		".json": "application/json",
		".svg": "image/svg+xml",
		".png": "image/png",
		".jpg": "image/jpeg",
		".jpeg": "image/jpeg",
		".webp": "image/webp",
		".ico": "image/x-icon",
		".map": "application/json",
		".woff": "font/woff",
		".woff2": "font/woff2",
	};

	protocol.handle("app", async (request) => {
		const url = new URL(request.url);

		// url.pathname is like "/index.html"
		let pathname = decodeURIComponent(url.pathname);

		// If you ever hit "app://-/" or empty, serve index.html
		if (pathname === "/" || pathname === "") pathname = "/index.html";

		// Resolve to disk
		const filePath = join(__dirname, pathname);

		try {
			const data = await readFile(filePath);
			const ext = extname(filePath).toLowerCase();
			const contentType = mimeByExt[ext] || "application/octet-stream";

			return new Response(data, {
				status: 200,
				headers: { "Content-Type": contentType },
			});
		} catch (error) {
			log.error("Failed to load app:// resource", { url: request.url, filePath, error });
			return new Response("Not found", { status: 404 });
		}
	});

	await createWindow();
});

app.on("window-all-closed", () => {
	if (process.platform !== "darwin") app.quit();
});
app.on("activate", () => {
	if (mainWindow === null) createWindow();
});
