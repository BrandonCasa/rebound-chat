const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
	checkForUpdates: () => ipcRenderer.send("check-for-updates"),
	downloadUpdate: () => ipcRenderer.send("download-update"),
	installUpdate: () => ipcRenderer.send("install-update"),
	simulateUpdate: () => ipcRenderer.send("simulate-update"),
	auth: {
		startGoogleLogin: (redirectTarget) => ipcRenderer.invoke("auth:start-google-login", redirectTarget),
		onGoogleLoginComplete: (cb) => {
			const listener = (_event, payload) => cb(payload);
			ipcRenderer.on("auth:google-complete", listener);
			return () => ipcRenderer.removeListener("auth:google-complete", listener);
		},
	},
	system: {
		getFfmpegPath: () => ipcRenderer.invoke("system:get-ffmpeg-path"),
		getFfprobePath: () => ipcRenderer.invoke("system:get-ffprobe-path"),
		getFfmpegUserDir: () => ipcRenderer.invoke("system:get-ffmpeg-user-dir"),
	},
	liveStream: {
		getState: () => ipcRenderer.invoke("live-stream:get-state"),
		getCapabilities: () => ipcRenderer.invoke("live-stream:get-capabilities"),
		getDetectedCapabilities: () => ipcRenderer.invoke("live-stream:get-detected-capabilities"),
		reprobeCapabilities: () => ipcRenderer.invoke("live-stream:reprobe-capabilities"),
		loadSettings: () => ipcRenderer.invoke("settings:load"),
		saveSettings: (settings) => ipcRenderer.invoke("settings:save", settings),
		resetSettings: () => ipcRenderer.invoke("settings:reset"),
		start: (config) => ipcRenderer.invoke("live-stream:start", config),
		stop: () => ipcRenderer.invoke("live-stream:stop"),
		setAutoAdapt: (enabled) => ipcRenderer.invoke("live-stream:set-auto-adapt", enabled),
		setResolutionAdapt: (enabled) => ipcRenderer.invoke("live-stream:set-resolution-adapt", enabled),
		openUrl: (url) => ipcRenderer.invoke("live-stream:open-url", url),
		onLog: (cb) => {
			const listener = (_event, payload) => cb(payload);
			ipcRenderer.on("live-stream-log", listener);
			return () => ipcRenderer.removeListener("live-stream-log", listener);
		},
		onState: (cb) => {
			const listener = (_event, payload) => cb(payload);
			ipcRenderer.on("live-stream-state", listener);
			return () => ipcRenderer.removeListener("live-stream-state", listener);
		},
		onSession: (cb) => {
			const listener = (_event, payload) => cb(payload);
			ipcRenderer.on("live-stream-session", listener);
			return () => ipcRenderer.removeListener("live-stream-session", listener);
		},
		onViewerSummary: (cb) => {
			const listener = (_event, payload) => cb(payload);
			ipcRenderer.on("live-stream-viewer-summary", listener);
			return () => ipcRenderer.removeListener("live-stream-viewer-summary", listener);
		},
		onRecommendation: (cb) => {
			const listener = (_event, payload) => cb(payload);
			ipcRenderer.on("live-stream-recommendation", listener);
			return () => ipcRenderer.removeListener("live-stream-recommendation", listener);
		},
		onAdaptation: (cb) => {
			const listener = (_event, payload) => cb(payload);
			ipcRenderer.on("live-stream-adaptation", listener);
			return () => ipcRenderer.removeListener("live-stream-adaptation", listener);
		},
		onControlConnected: (cb) => {
			const listener = (_event, payload) => cb(payload);
			ipcRenderer.on("live-stream-control-connected", listener);
			return () => ipcRenderer.removeListener("live-stream-control-connected", listener);
		},
	},
	sources: {
		list: (options) => ipcRenderer.invoke("sources:list", options),
		getCached: (sourceIds) => ipcRenderer.invoke("sources:cached", sourceIds),
		watch: (sources, options) => ipcRenderer.invoke("sources:watch", { sources, options }),
		unwatch: (subscriptionId) => ipcRenderer.invoke("sources:unwatch", subscriptionId),
		captureOnce: (source, options) => ipcRenderer.invoke("sources:capture-once", { source, options }),
		onThumbnail: (cb) => {
			const listener = (_event, payload) => cb(payload);
			ipcRenderer.on("sources:thumbnail", listener);
			return () => ipcRenderer.removeListener("sources:thumbnail", listener);
		},
		onError: (cb) => {
			const listener = (_event, payload) => cb(payload);
			ipcRenderer.on("sources:error", listener);
			return () => ipcRenderer.removeListener("sources:error", listener);
		},
	},

	onChecking: (cb) => ipcRenderer.on("update-checking", () => cb()),
	onUpdateAvailable: (cb) => ipcRenderer.on("update-available", (_e, info) => cb(info)),
	onUpdateNotAvailable: (cb) => ipcRenderer.on("update-not-available", () => cb()),
	onDownloadProgress: (cb) => ipcRenderer.on("download-progress", (_e, progress) => cb(progress)),
	onUpdateDownloaded: (cb) => ipcRenderer.on("update-downloaded", (_e, info) => cb(info)),
	onUpdateError: (cb) => ipcRenderer.on("update-error", (_e, err) => cb(err)),
});

contextBridge.exposeInMainWorld("IN_ELECTRON_ENV", true);
