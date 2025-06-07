import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  CircularProgress,
  Typography,
  Box,
} from "@mui/material";

const AutoUpdate = () => {
  const [checking, setChecking] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);

  useEffect(() => {
    const api = window.electronAPI;
    if (!api) return;

    api.onChecking(() => {
      setChecking(true);
      setError(null);
    });
    api.onUpdateAvailable(() => {
      setChecking(false);
      setUpdateAvailable(true);
    });
    api.onUpdateNotAvailable(() => {
      setChecking(false);
    });
    api.onDownloadProgress((info) => {
      setDownloading(true);
      setProgress(Math.round(info.percent));
    });
    api.onUpdateDownloaded(() => {
      setDownloading(false);
      api.installUpdate();
    });
    api.onUpdateError((err) => {
      setChecking(false);
      setDownloading(false);
      setError(err.message || "Unknown error");
    });

    // kick off the check
    api.checkForUpdates();
  }, []);

  return (
    <Dialog open={updateAvailable} disableEscapeKeyDown={downloading}>
      <DialogTitle>
        {error
          ? "Update Error"
          : checking
            ? "Checking for Update…"
            : !downloading
              ? "Update Available"
              : "Downloading..."}
      </DialogTitle>

      <DialogContent>
        {error && <Typography color="error">{error}</Typography>}

        {!error && downloading ? (
          <Box sx={{ textAlign: "center", p: 2 }}>
            <CircularProgress variant="determinate" value={progress} />
            <Typography variant="body2" mt={1}>
              {progress}% downloaded
            </Typography>
          </Box>
        ) : !error && !downloading ? (
          <Typography>A new version is ready—install it now?</Typography>
        ) : null}
      </DialogContent>

      {!downloading && (
        <DialogActions>
          <Button
            onClick={() => window.electronAPI.downloadUpdate()}
            variant="contained"
            disabled={downloading}
          >
            Install Now
          </Button>
          <Button
            onClick={() => setUpdateAvailable(false)}
            disabled={downloading}
          >
            Later
          </Button>
        </DialogActions>
      )}
    </Dialog>
  );
};

export default AutoUpdate;
