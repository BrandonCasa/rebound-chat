import mongoose, { Schema } from "mongoose";

const StreamAssetSchema = new Schema(
	{
		filename: {
			type: String,
			required: true,
		},
		storageKey: {
			type: String,
			required: true,
		},
		assetKind: {
			type: String,
			enum: ["master", "media-playlist", "segment"],
			required: true,
		},
		contentType: {
			type: String,
			required: true,
		},
		byteSize: {
			type: Number,
			required: true,
			min: 0,
		},
		createdAt: {
			type: Date,
			default: Date.now,
		},
		updatedAt: {
			type: Date,
			default: Date.now,
		},
		lastServedAt: {
			type: Date,
			default: null,
		},
	},
	{ _id: false }
);

const StreamSessionSchema = new Schema(
	{
		sessionId: {
			type: String,
			required: true,
			unique: true,
			index: true,
		},
		label: {
			type: String,
			default: "",
			maxlength: 120,
		},
		publicToken: {
			type: String,
			required: true,
			unique: true,
			index: true,
		},
		ingestSecretHash: {
			type: String,
			required: true,
		},
		createdByIp: {
			type: String,
			default: "",
		},
		lastHeartbeatAt: {
			type: Date,
			required: true,
			index: true,
		},
		expiresAt: {
			type: Date,
			required: true,
			index: true,
		},
		cleanupAfterAt: {
			type: Date,
			required: true,
			index: true,
		},
		endedAt: {
			type: Date,
			default: null,
		},
		status: {
			type: String,
			enum: ["active", "ended", "expired"],
			default: "active",
			index: true,
		},
		playbackPath: {
			type: String,
			required: true,
		},
		sharePath: {
			type: String,
			required: true,
		},
		storageBackend: {
			type: String,
			enum: ["local", "s3"],
			required: true,
		},
		storagePrefix: {
			type: String,
			required: true,
		},
		maxRetainedSegments: {
			type: Number,
			default: 5,
			min: 1,
			max: 10,
		},
		recentSegmentNames: [
			{
				type: String,
			},
		],
		assets: [StreamAssetSchema],
	},
	{ timestamps: true }
);

const StreamSessionModel = mongoose.model("StreamSession", StreamSessionSchema);

export default StreamSessionModel;
