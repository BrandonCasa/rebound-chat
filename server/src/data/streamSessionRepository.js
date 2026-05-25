import StreamSessionModel from "../models/StreamSession.js";
import { getPrismaClient } from "./prismaClient.js";

const transportModes = new Set(["hls", "webrtc", "hybrid"]);

const normalizeTransportMode = (value) => {
	const normalized = String(value || "")
		.trim()
		.toLowerCase();
	return transportModes.has(normalized) ? normalized : "hls";
};

const toIdStringOrNull = (value) => {
	if (!value) return null;
	if (typeof value === "string") return value;
	if (value._id) return toIdStringOrNull(value._id);
	if (typeof value.toString === "function") return value.toString();
	return null;
};

const unwrapDocument = (value) => {
	if (!value) return null;
	if (typeof value.toObject === "function") {
		return value.toObject({ depopulate: true, versionKey: false });
	}
	return value;
};

const mapAsset = (asset) => ({
	id: toIdStringOrNull(asset.id || asset._id),
	filename: asset.filename,
	storageKey: asset.storageKey,
	assetKind: asset.assetKind,
	contentType: asset.contentType,
	byteSize: asset.byteSize,
	createdAt: asset.createdAt || null,
	updatedAt: asset.updatedAt || null,
	lastServedAt: asset.lastServedAt || null,
});

const mapStreamSessionToRecord = (session) => {
	const raw = unwrapDocument(session);
	if (!raw) return null;

	const transportMode = normalizeTransportMode(raw.transportMode || raw.transport);

	return {
		id: toIdStringOrNull(raw.id || raw._id),
		sessionId: raw.sessionId,
		label: raw.label || "",
		publicToken: raw.publicToken,
		ingestSecretHash: raw.ingestSecretHash,
		createdByIp: raw.createdByIp || "",
		createdByUser: toIdStringOrNull(raw.createdByUser || raw.createdByUserId),
		createdByUsername: raw.createdByUsername || "",
		status: raw.status || "active",
		lastHeartbeatAt: raw.lastHeartbeatAt || null,
		expiresAt: raw.expiresAt || null,
		cleanupAfterAt: raw.cleanupAfterAt || null,
		endedAt: raw.endedAt || null,
		createdAt: raw.createdAt || null,
		updatedAt: raw.updatedAt || null,
		storageBackend: raw.storageBackend,
		storagePrefix: raw.storagePrefix,
		maxRetainedSegments: raw.maxRetainedSegments,
		recentSegmentNames: [...(raw.recentSegmentNames || [])],
		assets: (raw.assets || []).map(mapAsset),
		transport: {
			mode: transportMode,
			hls: {
				playbackPath: raw.playbackPath,
				sharePath: raw.sharePath,
				storagePrefix: raw.storagePrefix,
			},
			webrtc: {
				roomName: raw.webrtcRoomName || null,
				available: false,
				reason: transportMode === "hls" ? "hls_default" : "livekit_token_layer_not_enabled",
			},
		},
	};
};

class MongoStreamSessionRepository {
	constructor({ model = StreamSessionModel } = {}) {
		this.model = model;
	}

	async create(data) {
		return this.model.create(data);
	}

	async findBySessionId(sessionId) {
		return mapStreamSessionToRecord(await this.model.findOne({ sessionId }));
	}

	async findByPublicToken(publicToken) {
		return mapStreamSessionToRecord(await this.model.findOne({ publicToken }));
	}

	async listRecent({ limit = 100 } = {}) {
		const query = this.model.find({});
		const sessions = await query.sort({ updatedAt: -1 }).limit(limit);
		return sessions.map(mapStreamSessionToRecord);
	}

	async updateAssetServedAt(sessionId, filename, servedAt = new Date()) {
		return this.model.updateOne({ sessionId, "assets.filename": filename }, { $set: { "assets.$.lastServedAt": servedAt } });
	}
}

class PrismaStreamSessionRepository {
	constructor({ prisma = null } = {}) {
		this.prisma = prisma;
	}

	async _client() {
		if (this.prisma) return this.prisma;
		this.prisma = await getPrismaClient();
		return this.prisma;
	}

	async findBySessionId(sessionId) {
		const prisma = await this._client();
		return mapStreamSessionToRecord(
			await prisma.streamSession.findUnique({
				where: { sessionId },
				include: { assets: true },
			})
		);
	}

	async findByPublicToken(publicToken) {
		const prisma = await this._client();
		return mapStreamSessionToRecord(
			await prisma.streamSession.findUnique({
				where: { publicToken },
				include: { assets: true },
			})
		);
	}
}

const createStreamSessionRepository = ({ backingStore = "mongo", model, prisma } = {}) => {
	if (backingStore === "prisma") {
		return new PrismaStreamSessionRepository({ prisma });
	}

	return new MongoStreamSessionRepository({ model });
};

export { MongoStreamSessionRepository, PrismaStreamSessionRepository, createStreamSessionRepository, mapStreamSessionToRecord, normalizeTransportMode };
