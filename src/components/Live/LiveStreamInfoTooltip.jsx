import InfoOutlined from "@mui/icons-material/InfoOutlined";
import { Box, Divider, IconButton, Stack, Tooltip, Typography } from "@mui/material";

const formatDateTime = (value) => {
	if (!value) return "Unavailable";

	try {
		return new Intl.DateTimeFormat(undefined, {
			dateStyle: "medium",
			timeStyle: "short",
		}).format(new Date(value));
	} catch (_err) {
		return "Unavailable";
	}
};

const formatBytes = (value) => {
	const bytes = Number(value);
	if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";

	const units = ["B", "KB", "MB", "GB"];
	const unitIndex = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
	const amount = bytes / 1024 ** unitIndex;
	return `${amount >= 10 || unitIndex === 0 ? amount.toFixed(0) : amount.toFixed(1)} ${units[unitIndex]}`;
};

const formatBitrate = (value) => {
	const bits = Number(value);
	if (!Number.isFinite(bits) || bits <= 0) return "Unavailable";
	if (bits >= 1_000_000) return `${(bits / 1_000_000).toFixed(1)} Mbps`;
	if (bits >= 1_000) return `${Math.round(bits / 1_000)} Kbps`;
	return `${bits} bps`;
};

const formatDuration = (value) => {
	const seconds = Number(value);
	if (!Number.isFinite(seconds) || seconds <= 0) return "Unavailable";
	return `${seconds.toFixed(seconds >= 10 ? 0 : 1)}s`;
};

const InfoRow = ({ label, value }) => (
	<Stack direction="row" spacing={1.5} justifyContent="space-between" alignItems="baseline">
		<Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
			{label}
		</Typography>
		<Typography variant="caption" sx={{ textAlign: "right", maxWidth: 220, overflowWrap: "anywhere" }}>
			{value || "Unavailable"}
		</Typography>
	</Stack>
);

const LiveStreamInfoContent = ({ stream }) => {
	const mediaInfo = stream?.mediaInfo || {};
	const master = mediaInfo.masterPlaylist || {};
	const media = mediaInfo.mediaPlaylist || {};
	const latestSegment = mediaInfo.latestSegment || {};

	return (
		<Box sx={{ maxWidth: 340, p: 0.5 }}>
			<Stack spacing={1}>
				<Stack spacing={0.25}>
					<Typography variant="subtitle2">{stream?.label || "Live session"}</Typography>
					<Typography variant="caption" color="text.secondary">
						Current ingest details
					</Typography>
				</Stack>
				<Divider />
				<InfoRow label="Status" value={stream?.status || "Unavailable"} />
				<InfoRow label="Playable" value={stream?.isPlayable ? "Ready" : "Waiting for playlists"} />
				<InfoRow label="Resolution" value={master.resolution} />
				<InfoRow label="Bitrate" value={formatBitrate(master.bandwidth)} />
				<InfoRow label="Codecs" value={master.codecs} />
				<InfoRow label="Frame rate" value={master.frameRate ? `${master.frameRate} fps` : ""} />
				<Divider />
				<InfoRow label="Target duration" value={formatDuration(media.targetDuration)} />
				<InfoRow label="Sequence" value={media.mediaSequence ?? ""} />
				<InfoRow label="Playlist window" value={formatDuration(media.totalDuration)} />
				<InfoRow label="Playlist segments" value={media.segmentCount ?? ""} />
				<InfoRow label="Retained files" value={mediaInfo.retainedSegmentCount ?? ""} />
				<InfoRow label="Latest segment" value={latestSegment.filename || media.latestSegmentUri} />
				<InfoRow label="Latest size" value={latestSegment.byteSize ? formatBytes(latestSegment.byteSize) : ""} />
				<InfoRow label="Total retained" value={formatBytes(mediaInfo.totalRetainedBytes)} />
				<InfoRow label="Updated" value={formatDateTime(mediaInfo.playlists?.media?.updatedAt || stream?.lastHeartbeatAt)} />
			</Stack>
		</Box>
	);
};

function LiveStreamInfoTooltip({ stream, size = "small", sx }) {
	return (
		<Tooltip
			arrow
			placement="left"
			title={<LiveStreamInfoContent stream={stream} />}
			slotProps={{
				tooltip: {
					sx: {
						bgcolor: "background.paper",
						color: "text.primary",
						border: (theme) => `1px solid ${theme.palette.divider}`,
						boxShadow: 8,
						maxWidth: 380,
					},
				},
				arrow: {
					sx: {
						color: "background.paper",
					},
				},
			}}>
			<IconButton size={size} sx={sx} aria-label="Show stream ingest information">
				<InfoOutlined fontSize={size === "small" ? "small" : "medium"} />
			</IconButton>
		</Tooltip>
	);
}

export { formatBytes, formatDateTime, formatDuration };
export default LiveStreamInfoTooltip;
