export type StreamSessionStatus = "active" | "ended" | "expired";

export type StreamAssetKind = "master" | "media-playlist" | "segment";

export interface StreamAssetMetadata {
	filename: string;
	storageKey: string;
	assetKind: StreamAssetKind;
	contentType: string;
	byteSize: number;
	createdAt: Date;
	updatedAt: Date;
	lastServedAt: Date | null;
}

export interface StreamSessionMetadata {
	sessionId: string;
	label: string;
	publicToken: string;
	createdByIp: string;
	status: StreamSessionStatus;
	playbackPath: string;
	sharePath: string;
	storageBackend: "local" | "s3";
	storagePrefix: string;
	maxRetainedSegments: number;
	recentSegmentNames: string[];
	createdAt: Date;
	updatedAt: Date;
	lastHeartbeatAt: Date;
	expiresAt: Date;
	cleanupAfterAt: Date;
	endedAt: Date | null;
	assets: StreamAssetMetadata[];
}

export interface LiveShareSummary {
	sessionId: string;
	label: string;
	status: StreamSessionStatus;
	createdAt: Date;
	lastHeartbeatAt: Date;
	expiresAt: Date;
	endedAt: Date | null;
	playbackUrl: string;
	shareUrl: string;
	recentSegmentCount: number;
	hasMasterPlaylist: boolean;
	hasMediaPlaylist: boolean;
	isPlayable: boolean;
}
