// main.mjs (or main.js with "type": "module" in package.json)

import { fileURLToPath } from "url";
import { dirname, extname, join } from "path";
import { existsSync } from "fs";
import { readFile } from "fs/promises";
import { app, BrowserWindow, desktopCapturer, ipcMain, protocol, screen, shell } from "electron";
import log from "electron-log";
import updater from "electron-updater";
const { autoUpdater } = updater;
import isDev from "electron-is-dev";
import { registerLiveStreamIpc } from "./electron-live-stream.js";
import { SourceService, registerSourceServiceIpc } from "./sources/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const bundledFfmpegRoot = isDev ? join(__dirname, "..", "native", "ffmpeg") : join(process.resourcesPath, "ffmpeg");

const userFfmpegRoot = join(app.getPath("userData"), "ffmpeg");

const resolveFfBinary = (name) => {
	const filename = process.platform === "win32" ? `${name}.exe` : name;
	const userOverride = join(userFfmpegRoot, "bin", filename);
	if (existsSync(userOverride)) return userOverride;
	return join(bundledFfmpegRoot, "bin", filename);
};

const ffmpegBinaryPath = resolveFfBinary("ffmpeg");
const ffprobeBinaryPath = resolveFfBinary("ffprobe");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let mainWindow;
let googleAuthWindow;
let completingGoogleAuth = false;

const getParsedUrl = (url) => {
	try {
		return new URL(url);
	} catch {
		return null;
	}
};

const isAllowedOAuthRedirectTarget = (url) => {
	const parsed = getParsedUrl(url);
	if (!parsed) return false;

	if (parsed.protocol === "app:") {
		return parsed.host === "-";
	}

	return ["http:", "https:"].includes(parsed.protocol) && ["localhost:3000", "rebound.nexus", "www.rebound.nexus"].includes(parsed.host);
};

const isGoogleAuthCompletionUrl = (url) => {
	const parsed = getParsedUrl(url);
	if (!parsed || !isAllowedOAuthRedirectTarget(url)) return false;

	return parsed.searchParams.get("authComplete") === "google" || parsed.searchParams.get("authError") === "google";
};

const makeElectronCompatibleCookie = (cookie, isSecureUrl) => {
	let normalized = cookie.replace(/;\s*SameSite=(Strict|Lax|None)/gi, "");

	if (isSecureUrl) {
		normalized += "; SameSite=None";
	} else {
		normalized += "; SameSite=Lax";
	}

	if (isSecureUrl && !/;\s*Secure/i.test(normalized)) {
		normalized += "; Secure";
	}

	return normalized;
};

const rewriteOAuthCookiesForElectron = (details) => {
	const headers = details.responseHeaders || {};
	const cookieHeaderName = Object.keys(headers).find((name) => name.toLowerCase() === "set-cookie");

	if (!cookieHeaderName) return null;

	const isSecureUrl = details.url.startsWith("https:");
	const cookies = Array.isArray(headers[cookieHeaderName]) ? headers[cookieHeaderName] : [headers[cookieHeaderName]].filter(Boolean);

	return {
		...headers,
		[cookieHeaderName]: cookies.map((cookie) => makeElectronCompatibleCookie(cookie, isSecureUrl)),
	};
};

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

const broadcastToRenderers = (channel, payload) => {
	for (const win of BrowserWindow.getAllWindows()) {
		if (!win.isDestroyed()) {
			win.webContents.send(channel, payload);
		}
	}
};

const sourceService = new SourceService({
	desktopCapturer,
	onLog: (message) => log.info(`[sources] ${message}`),
	onError: (err, sourceId) => log.error(`[sources] ${sourceId || ""} ${err?.message || err}`),
});

let sourceIpcDispose = null;

registerLiveStreamIpc({
	ipcMain,
	app,
	shell,
	ffmpegPath: ffmpegBinaryPath,
	getDisplays: () => screen.getAllDisplays(),
	sendToRenderer: sendStatus,
	logger: log,
});

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

	mainWindow.webContents.setWindowOpenHandler(({ url }) => {
		// open url in a browser and prevent default
		shell.openExternal(url);
		return { action: "deny" };
	});

	// Helpful when diagnosing protocol issues:
	mainWindow.webContents.on("did-fail-load", (_e, code, desc, url) => {
		log.error("did-fail-load", { code, desc, url });
	});

	mainWindow.webContents.session.webRequest.onHeadersReceived(
		{ urls: ["https://rebound.nexus/*", "http://localhost:6001/*", "http://localhost:3000/*"] },
		(details, callback) => {
			const responseHeaders = rewriteOAuthCookiesForElectron(details);
			if (responseHeaders) {
				callback({ responseHeaders });
				return;
			}

			callback({ cancel: false });
		}
	);

	if (isDev) {
		await mainWindow.loadURL("http://localhost:3000");
	} else {
		await mainWindow.loadURL("app://-/index.html");
	}
}

const completeGoogleAuthNavigation = async (url) => {
	if (!mainWindow || completingGoogleAuth || !isGoogleAuthCompletionUrl(url)) return false;

	completingGoogleAuth = true;

	try {
		const parsed = getParsedUrl(url);
		const authComplete = parsed?.searchParams.get("authComplete") === "google";
		const authError = parsed?.searchParams.get("authError") === "google";

		mainWindow.webContents.send("auth:google-complete", {
			success: authComplete,
			error: authError,
			url,
		});

		if (googleAuthWindow && !googleAuthWindow.isDestroyed()) {
			googleAuthWindow.close();
		}

		googleAuthWindow = null;
		mainWindow.focus();
		return true;
	} finally {
		completingGoogleAuth = false;
	}
};

const startGoogleLogin = async (_event, redirectTarget) => {
	if (!mainWindow) {
		throw new Error("Main window is not ready.");
	}

	const target = isAllowedOAuthRedirectTarget(redirectTarget) ? redirectTarget : "app://-/index.html";
	const apiBase = isDev ? "http://localhost:6001/api" : "https://rebound.nexus/api";
	const authUrl = `${apiBase}/users/google?redirect=${encodeURIComponent(target)}`;

	if (googleAuthWindow && !googleAuthWindow.isDestroyed()) {
		googleAuthWindow.close();
	}

	googleAuthWindow = new BrowserWindow({
		width: 520,
		height: 720,
		parent: mainWindow,
		modal: false,
		show: true,
		webPreferences: {
			nodeIntegration: false,
			contextIsolation: true,
			session: mainWindow.webContents.session,
		},
	});

	const handleNavigation = async (event, url) => {
		if (!isGoogleAuthCompletionUrl(url)) return;
		if (typeof event?.preventDefault === "function") {
			event.preventDefault();
		}

		try {
			await completeGoogleAuthNavigation(url);
		} catch (error) {
			log.error("Failed to complete Google auth navigation", { url, error });
		}
	};

	googleAuthWindow.webContents.setWindowOpenHandler(({ url }) => {
		if (isGoogleAuthCompletionUrl(url)) {
			void completeGoogleAuthNavigation(url);
			return { action: "deny" };
		}

		shell.openExternal(url);
		return { action: "deny" };
	});
	googleAuthWindow.webContents.on("did-start-navigation", handleNavigation);
	googleAuthWindow.webContents.on("will-navigate", handleNavigation);
	googleAuthWindow.webContents.on("will-redirect", handleNavigation);
	googleAuthWindow.webContents.on("did-redirect-navigation", handleNavigation);
	googleAuthWindow.webContents.on("did-navigate", handleNavigation);
	googleAuthWindow.webContents.on("did-fail-load", (_event, code, desc, url) => {
		if (isGoogleAuthCompletionUrl(url)) {
			void completeGoogleAuthNavigation(url);
			return;
		}

		log.warn("Google auth window failed to load", { code, desc, url });
	});
	googleAuthWindow.on("closed", () => {
		googleAuthWindow = null;
	});

	void googleAuthWindow.loadURL(authUrl).catch((error) => {
		log.warn("Google auth initial navigation reported an error", { url: authUrl, error });
	});

	return { started: true };
};

// wire up IPC
ipcMain.handle("auth:start-google-login", startGoogleLogin);
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
	if (!existsSync(ffmpegBinaryPath)) {
		log.warn(`ffmpeg binary not found at ${ffmpegBinaryPath}. Place a custom binary at ${join(userFfmpegRoot, "bin")} or run 'pnpm run prepare:ffmpeg'.`);
	}
	if (!existsSync(ffprobeBinaryPath)) {
		log.warn(`ffprobe binary not found at ${ffprobeBinaryPath}. Place a custom binary at ${join(userFfmpegRoot, "bin")} or run 'pnpm run prepare:ffmpeg'.`);
	}

	try {
		await sourceService.start();
		const registration = registerSourceServiceIpc({
			ipcMain,
			service: sourceService,
			broadcast: broadcastToRenderers,
		});
		sourceIpcDispose = registration.dispose;
	} catch (err) {
		log.error("Failed to start SourceService", err);
	}

	ipcMain.handle("system:get-ffmpeg-path", () => resolveFfBinary("ffmpeg"));
	ipcMain.handle("system:get-ffprobe-path", () => resolveFfBinary("ffprobe"));
	ipcMain.handle("system:get-ffmpeg-user-dir", () => userFfmpegRoot);

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

app.on("before-quit", () => {
	if (sourceIpcDispose) {
		try {
			sourceIpcDispose();
		} catch (err) {
			log.warn("Failed to dispose source IPC handlers", err);
		}
		sourceIpcDispose = null;
	}
});

app.on("will-quit", async (event) => {
	if (!sourceService.started || sourceService.stopped) return;
	event.preventDefault();
	try {
		await sourceService.stop();
	} catch (err) {
		log.warn("Failed to stop SourceService cleanly", err);
	}
	app.quit();
});

app.on("window-all-closed", () => {
	if (process.platform !== "darwin") app.quit();
});
app.on("activate", () => {
	if (mainWindow === null) createWindow();
});
