import GroupRounded from "@mui/icons-material/GroupRounded";
import HistoryRounded from "@mui/icons-material/HistoryRounded";
import RouterRounded from "@mui/icons-material/RouterRounded";
import TuneRounded from "@mui/icons-material/TuneRounded";
import VerticalAlignTopRounded from "@mui/icons-material/VerticalAlignTopRounded";
import { Alert, Box, Chip, Divider, FormControlLabel, Paper, Stack, Switch, Tooltip, Typography } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import React, { useMemo } from "react";

const formatBitrate = (value) => {
	if (value == null) return "—";
	if (typeof value === "string") return value;
	if (typeof value !== "number" || !Number.isFinite(value)) return "—";
	if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2).replace(/\.00$/, "")} Mbit/s`;
	if (value >= 1_000) return `${Math.round(value / 1_000)} kbit/s`;
	return `${value} bit/s`;
};

const formatNullable = (value, suffix = "") => {
	if (value == null || value === "") return "—";
	return `${value}${suffix}`;
};

const formatResolution = (width, height) => {
	if (!width || !height) return "—";
	return `${width}×${height}`;
};

const formatRelativeTime = (timestamp) => {
	if (!timestamp) return "";
	const delta = Date.now() - timestamp;
	if (delta < 0) return "just now";
	const seconds = Math.round(delta / 1000);
	if (seconds < 60) return `${seconds}s ago`;
	const minutes = Math.round(seconds / 60);
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.round(minutes / 60);
	return `${hours}h ago`;
};

const formatDiff = (entry) => {
	if (!entry?.diff?.length) return "no change";
	return entry.diff
		.map((line) => {
			const formatValue = (value) => {
				if (line.field === "videoBitrate") return formatBitrate(value);
				return formatNullable(value);
			};
			return `${line.field}: ${formatValue(line.from)} → ${formatValue(line.to)}`;
		})
		.join("; ");
};

const StatRow = ({ icon, label, value, secondary }) => {
	const theme = useTheme();
	return (
		<Stack direction="row" spacing={1.5} alignItems="center" data-testid="live-status-stat-row" data-live-status-stat={label || ""}>
			<Box sx={{ color: theme.palette.text.secondary, display: "flex" }}>{icon}</Box>
			<Stack spacing={0.25} sx={{ flexGrow: 1, minWidth: 0 }}>
				<Typography variant="caption" color="text.secondary">
					{label}
				</Typography>
				<Typography variant="body2">{value}</Typography>
			</Stack>
			{secondary != null ? (
				<Typography variant="caption" color="text.secondary">
					{secondary}
				</Typography>
			) : null}
		</Stack>
	);
};

const LiveStatusPanel = ({
	streamState,
	viewerSummary,
	recommendation,
	adaptationHistory = [],
	currentSettings,
	initialCeiling,
	autoAdaptEnabled,
	onToggleAutoAdapt,
	resolutionAdaptEnabled,
	onToggleResolutionAdapt,
	controlConnected,
}) => {
	const isStreaming = ["starting", "streaming", "stopping"].includes(streamState?.status);

	const summaryRows = useMemo(() => {
		const viewerCount = viewerSummary?.viewerCount ?? 0;
		const minDownlink = viewerSummary?.minDownlinkMbit;
		const medianDownlink = viewerSummary?.medianDownlinkMbit;
		const supportedCodecs = (viewerSummary?.supportedCodecs || []).join(", ") || "—";
		const maxResolution = viewerSummary?.maxResolution ? `${viewerSummary.maxResolution.w}×${viewerSummary.maxResolution.h}` : "—";
		const saveDataCount = viewerSummary?.saveDataCount ?? 0;

		return [
			{
				icon: <GroupRounded fontSize="small" />,
				label: "Viewers connected",
				value: viewerCount === 0 ? "0 — adaptation idle" : `${viewerCount}`,
				secondary: saveDataCount ? `${saveDataCount} save-data` : null,
			},
			{
				icon: <RouterRounded fontSize="small" />,
				label: "Worst viewer downlink",
				value: minDownlink == null ? "—" : `${minDownlink.toFixed(2)} Mbit/s`,
				secondary: medianDownlink != null ? `median ${medianDownlink.toFixed(2)}` : null,
			},
			{ icon: <TuneRounded fontSize="small" />, label: "Codec families viewers can decode", value: supportedCodecs },
			{ icon: <VerticalAlignTopRounded fontSize="small" />, label: "Largest viewport across viewers", value: maxResolution },
		];
	}, [viewerSummary]);

	const currentRows = useMemo(() => {
		if (!currentSettings) return [];
		return [
			{ label: "Bitrate", value: formatBitrate(currentSettings.videoBitrate), ceiling: formatBitrate(initialCeiling?.videoBitrate) },
			{ label: "Codec", value: formatNullable(currentSettings.videoCodec), ceiling: formatNullable(initialCeiling?.videoCodec) },
			{
				label: "Resolution",
				value: formatResolution(currentSettings.outputWidth, currentSettings.outputHeight),
				ceiling: formatResolution(initialCeiling?.outputWidth, initialCeiling?.outputHeight),
			},
			{ label: "FPS", value: formatNullable(currentSettings.fps), ceiling: formatNullable(initialCeiling?.fps) },
		];
	}, [currentSettings, initialCeiling]);

	if (!isStreaming && !viewerSummary) {
		return null;
	}

	return (
		<Paper variant="outlined" sx={{ p: 2 }} data-testid="live-status-panel">
			<Stack spacing={1.5}>
				<Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
					<Stack spacing={0.25}>
						<Typography variant="h6">Live status</Typography>
						<Typography variant="body2" color="text.secondary">
							What viewers are actually receiving — and how the server is asking us to adapt.
						</Typography>
					</Stack>
					<Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap">
						<Tooltip
							title={
								controlConnected ? "Connected to live-control channel" : "Disconnected from live-control channel — recommendations will queue until reconnect."
							}>
							<Chip
								size="small"
								label={controlConnected ? "Control link" : "Reconnecting"}
								color={controlConnected ? "success" : "warning"}
								variant={controlConnected ? "filled" : "outlined"}
								data-testid="live-status-control-link-chip"
							/>
						</Tooltip>
						<FormControlLabel
							control={
								<Switch
									size="small"
									checked={Boolean(autoAdaptEnabled)}
									onChange={(event) => onToggleAutoAdapt?.(event.target.checked)}
									inputProps={{ "data-testid": "live-status-auto-adapt-switch" }}
								/>
							}
							label={autoAdaptEnabled ? "Auto-adapt" : "Auto-adapt off"}
							data-testid="live-status-auto-adapt-toggle"
						/>
						<Tooltip
							title={
								resolutionAdaptEnabled
									? "Resolution can step down (and back up) with viewer conditions. Most disruptive: viewers see a sharpness change."
									: "Resolution is pinned at its current value. Bitrate, frame rate, and codec can still adapt."
							}>
							<FormControlLabel
								control={
									<Switch
										size="small"
										checked={Boolean(resolutionAdaptEnabled)}
										onChange={(event) => onToggleResolutionAdapt?.(event.target.checked)}
										disabled={!autoAdaptEnabled}
										inputProps={{ "data-testid": "live-status-resolution-adapt-switch" }}
									/>
								}
								label={resolutionAdaptEnabled ? "Adapt resolution" : "Resolution pinned"}
							/>
						</Tooltip>
					</Stack>
				</Stack>

				<Divider />

				<Stack spacing={1}>
					{summaryRows.map((row) => (
						<StatRow key={row.label} icon={row.icon} label={row.label} value={row.value} secondary={row.secondary} />
					))}
				</Stack>

				<Divider />

				<Stack spacing={0.5}>
					<Typography variant="subtitle2">Current vs. your ceiling</Typography>
					<Box
						sx={{
							display: "grid",
							gridTemplateColumns: "1fr auto auto",
							columnGap: 1.5,
							rowGap: 0.5,
							alignItems: "center",
						}}>
						<Typography variant="caption" color="text.secondary">
							Field
						</Typography>
						<Typography variant="caption" color="text.secondary">
							Current
						</Typography>
						<Typography variant="caption" color="text.secondary">
							Your ceiling
						</Typography>
						{currentRows.map((row) => (
							<React.Fragment key={row.label}>
								<Typography variant="body2">{row.label}</Typography>
								<Typography variant="body2" sx={{ fontWeight: 600 }}>
									{row.value}
								</Typography>
								<Typography variant="caption" color="text.secondary">
									{row.ceiling}
								</Typography>
							</React.Fragment>
						))}
					</Box>
					<Typography variant="caption" color="text.secondary">
						Server-driven adaptation can only ever lower these values. Disable Auto-adapt to lock everything at your ceiling, or leave Resolution pinned to keep
						the picture sharpness fixed while bitrate and frame rate still flex.
					</Typography>
				</Stack>

				{recommendation ? (
					<Alert
						severity="info"
						icon={<TuneRounded fontSize="inherit" />}
						sx={{ "& .MuiAlert-message": { width: "100%" } }}
						data-testid="live-status-recommendation">
						<Typography variant="body2" sx={{ fontWeight: 600 }}>
							Latest recommendation
						</Typography>
						<Typography variant="caption" color="text.secondary">
							{recommendation.reason || "no reason supplied"}
						</Typography>
						<Box
							sx={{
								mt: 0.5,
								display: "grid",
								gridTemplateColumns: "1fr auto",
								gap: 0.5,
								color: "text.secondary",
							}}>
							<Typography variant="caption">Bitrate</Typography>
							<Typography variant="caption">{formatBitrate(recommendation.videoBitrate)}</Typography>
							<Typography variant="caption">Codec</Typography>
							<Typography variant="caption">{formatNullable(recommendation.videoCodec)}</Typography>
							<Typography variant="caption">Resolution</Typography>
							<Typography variant="caption">{formatResolution(recommendation.outputWidth, recommendation.outputHeight)}</Typography>
							<Typography variant="caption">FPS</Typography>
							<Typography variant="caption">{formatNullable(recommendation.fps)}</Typography>
						</Box>
					</Alert>
				) : null}

				{adaptationHistory.length ? (
					<Stack spacing={0.75} data-testid="live-status-adaptation-log">
						<Stack direction="row" spacing={1} alignItems="center">
							<HistoryRounded fontSize="small" sx={{ color: "text.secondary" }} />
							<Typography variant="subtitle2">Adaptation log</Typography>
						</Stack>
						<Stack
							spacing={0.5}
							sx={{
								maxHeight: 220,
								overflowY: "auto",
								pr: 0.5,
								"::-webkit-scrollbar": { width: 6 },
								"::-webkit-scrollbar-thumb": (theme) => ({ backgroundColor: alpha(theme.palette.divider, 0.6) }),
							}}>
							{[...adaptationHistory].reverse().map((entry, index) => (
								<Box key={`${entry.appliedAt}-${index}`} sx={{ borderLeft: (theme) => `2px solid ${theme.palette.primary.main}`, pl: 1 }}>
									<Typography variant="caption" color="text.secondary">
										{formatRelativeTime(entry.appliedAt)} · gen {entry.generation}
										{entry.viewerCount != null ? ` · ${entry.viewerCount} viewer${entry.viewerCount === 1 ? "" : "s"}` : ""}
										{entry.clampedBy ? ` · clamped by ${entry.clampedBy}` : ""}
									</Typography>
									<Typography variant="body2">{formatDiff(entry)}</Typography>
									{entry.reason ? (
										<Typography variant="caption" color="text.secondary">
											{entry.reason}
										</Typography>
									) : null}
								</Box>
							))}
						</Stack>
					</Stack>
				) : null}
			</Stack>
		</Paper>
	);
};

export default LiveStatusPanel;
