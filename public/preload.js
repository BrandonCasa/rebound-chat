const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  checkForUpdates: () => ipcRenderer.send("check-for-updates"),
  downloadUpdate: () => ipcRenderer.send("download-update"),
  installUpdate: () => ipcRenderer.send("install-update"),
  simulateUpdate: () => ipcRenderer.send("simulate-update"),

  onChecking: (cb) => ipcRenderer.on("update-checking", () => cb()),
  onUpdateAvailable: (cb) =>
    ipcRenderer.on("update-available", (_e, info) => cb(info)),
  onUpdateNotAvailable: (cb) =>
    ipcRenderer.on("update-not-available", () => cb()),
  onDownloadProgress: (cb) =>
    ipcRenderer.on("download-progress", (_e, progress) => cb(progress)),
  onUpdateDownloaded: (cb) =>
    ipcRenderer.on("update-downloaded", (_e, info) => cb(info)),
  onUpdateError: (cb) => ipcRenderer.on("update-error", (_e, err) => cb(err)),
});

contextBridge.exposeInMainWorld("IN_ELECTRON_ENV", true);
