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
	createdByUser: string | null;
	createdByUsername: string;
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
	createdByUser: string | null;
	createdByUsername: string;
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
	mediaInfo: {
		storageBackend: "local" | "s3";
		maxRetainedSegments: number;
		retainedSegmentNames: string[];
		retainedSegmentCount: number;
		assetCount: number;
		totalRetainedBytes: number;
		latestSegment: StreamAssetMetadata | null;
		playlists: {
			master: StreamAssetMetadata | null;
			media: StreamAssetMetadata | null;
		};
		masterPlaylist: {
			bandwidth: number | null;
			averageBandwidth: number | null;
			codecs: string;
			resolution: string;
			frameRate: number | null;
			videoRange: string;
		} | null;
		mediaPlaylist: {
			targetDuration: number | null;
			mediaSequence: number | null;
			segmentCount: number;
			totalDuration: number;
			latestSegmentUri: string;
			firstSegmentUri: string;
			mapUri: string;
			hasEndList: boolean;
			independentSegments: boolean;
		} | null;
	};
}
