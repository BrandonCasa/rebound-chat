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
	if (value?._bsontype === "ObjectId" || value?.constructor?.name === "ObjectId") {
		return value.toString();
	}
	if (value._id && value._id !== value) return toIdStringOrNull(value._id);
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
		transportMode,
		playbackPath: raw.playbackPath,
		sharePath: raw.sharePath,
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

const toPrismaStreamSessionStatus = (value = "active") => String(value || "active").toUpperCase();
const toPrismaTransportMode = (value = "hls") => normalizeTransportMode(value).toUpperCase();
const toPrismaAssetKind = (value = "segment") => {
	const normalized = String(value || "segment")
		.trim()
		.toLowerCase();
	if (normalized === "master") return "MASTER";
	if (normalized === "media-playlist") return "MEDIA_PLAYLIST";
	return "SEGMENT";
};

const toMongoCreateData = (record) => ({
	sessionId: record.sessionId,
	label: record.label || "",
	publicToken: record.publicToken,
	ingestSecretHash: record.ingestSecretHash,
	createdByIp: record.createdByIp || "",
	createdByUser: record.createdByUser || null,
	createdByUsername: record.createdByUsername || "",
	status: record.status || "active",
	transportMode: normalizeTransportMode(record.transportMode),
	playbackPath: record.playbackPath,
	sharePath: record.sharePath,
	storageBackend: record.storageBackend,
	storagePrefix: record.storagePrefix,
	maxRetainedSegments: record.maxRetainedSegments,
	recentSegmentNames: [...(record.recentSegmentNames || [])],
	lastHeartbeatAt: record.lastHeartbeatAt,
	expiresAt: record.expiresAt,
	cleanupAfterAt: record.cleanupAfterAt,
	endedAt: record.endedAt || null,
	assets: (record.assets || []).map((asset) => ({
		filename: asset.filename,
		storageKey: asset.storageKey,
		assetKind: asset.assetKind,
		contentType: asset.contentType,
		byteSize: asset.byteSize,
		createdAt: asset.createdAt || undefined,
		updatedAt: asset.updatedAt || undefined,
		lastServedAt: asset.lastServedAt || null,
	})),
});

const toMongoSaveData = (record) => ({
	label: record.label || "",
	ingestSecretHash: record.ingestSecretHash,
	createdByIp: record.createdByIp || "",
	createdByUser: record.createdByUser || null,
	createdByUsername: record.createdByUsername || "",
	status: record.status || "active",
	transportMode: normalizeTransportMode(record.transportMode),
	playbackPath: record.playbackPath,
	sharePath: record.sharePath,
	storageBackend: record.storageBackend,
	storagePrefix: record.storagePrefix,
	maxRetainedSegments: record.maxRetainedSegments,
	recentSegmentNames: [...(record.recentSegmentNames || [])],
	lastHeartbeatAt: record.lastHeartbeatAt,
	expiresAt: record.expiresAt,
	cleanupAfterAt: record.cleanupAfterAt,
	endedAt: record.endedAt || null,
	assets: (record.assets || []).map((asset) => ({
		filename: asset.filename,
		storageKey: asset.storageKey,
		assetKind: asset.assetKind,
		contentType: asset.contentType,
		byteSize: asset.byteSize,
		createdAt: asset.createdAt || new Date(),
		updatedAt: asset.updatedAt || new Date(),
		lastServedAt: asset.lastServedAt || null,
	})),
});

const toPrismaCreateData = (record) => ({
	sessionId: record.sessionId,
	label: record.label || "",
	publicToken: record.publicToken,
	ingestSecretHash: record.ingestSecretHash,
	createdByIp: record.createdByIp || "",
	createdByUserId: record.createdByUser || null,
	createdByUsername: record.createdByUsername || "",
	status: toPrismaStreamSessionStatus(record.status),
	transportMode: toPrismaTransportMode(record.transportMode),
	playbackPath: record.playbackPath,
	sharePath: record.sharePath,
	storageBackend: record.storageBackend,
	storagePrefix: record.storagePrefix,
	maxRetainedSegments: record.maxRetainedSegments,
	recentSegmentNames: [...(record.recentSegmentNames || [])],
	lastHeartbeatAt: record.lastHeartbeatAt,
	expiresAt: record.expiresAt,
	cleanupAfterAt: record.cleanupAfterAt,
	endedAt: record.endedAt || null,
	assets: {
		create: (record.assets || []).map((asset) => ({
			filename: asset.filename,
			storageKey: asset.storageKey,
			assetKind: toPrismaAssetKind(asset.assetKind),
			contentType: asset.contentType,
			byteSize: asset.byteSize,
			createdAt: asset.createdAt || undefined,
			updatedAt: asset.updatedAt || undefined,
			lastServedAt: asset.lastServedAt || null,
		})),
	},
});

class MongoStreamSessionRepository {
	constructor({ model = StreamSessionModel } = {}) {
		this.model = model;
	}

	async create(data) {
		return mapStreamSessionToRecord(await this.model.create(toMongoCreateData(data)));
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

	async findActiveByCreatedByUser(createdByUser) {
		const sessions = await this.model.find({
			createdByUser,
			status: "active",
		});
		return sessions.map(mapStreamSessionToRecord);
	}

	async findExpiredActive(now = new Date()) {
		const sessions = await this.model.find({
			status: "active",
			expiresAt: { $lte: now },
		});
		return sessions.map(mapStreamSessionToRecord);
	}

	async findStaleFinished(now = new Date()) {
		const sessions = await this.model.find({
			status: { $in: ["ended", "expired"] },
			cleanupAfterAt: { $lte: now },
		});
		return sessions.map(mapStreamSessionToRecord);
	}

	async save(record) {
		await this.model.updateOne({ sessionId: record.sessionId }, { $set: toMongoSaveData(record) }, { upsert: false });
		return this.findBySessionId(record.sessionId);
	}

	async deleteById(id) {
		return this.model.deleteOne({ _id: id });
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

	async create(data) {
		const prisma = await this._client();
		return mapStreamSessionToRecord(
			await prisma.streamSession.create({
				data: toPrismaCreateData(data),
				include: { assets: true },
			})
		);
	}

	async listRecent({ limit = 100 } = {}) {
		const prisma = await this._client();
		const sessions = await prisma.streamSession.findMany({
			orderBy: { updatedAt: "desc" },
			take: limit,
			include: { assets: true },
		});
		return sessions.map(mapStreamSessionToRecord);
	}

	async findActiveByCreatedByUser(createdByUser) {
		const prisma = await this._client();
		const sessions = await prisma.streamSession.findMany({
			where: {
				createdByUserId: createdByUser,
				status: "ACTIVE",
			},
			include: { assets: true },
		});
		return sessions.map(mapStreamSessionToRecord);
	}

	async findExpiredActive(now = new Date()) {
		const prisma = await this._client();
		const sessions = await prisma.streamSession.findMany({
			where: {
				status: "ACTIVE",
				expiresAt: { lte: now },
			},
			include: { assets: true },
		});
		return sessions.map(mapStreamSessionToRecord);
	}

	async findStaleFinished(now = new Date()) {
		const prisma = await this._client();
		const sessions = await prisma.streamSession.findMany({
			where: {
				status: { in: ["ENDED", "EXPIRED"] },
				cleanupAfterAt: { lte: now },
			},
			include: { assets: true },
		});
		return sessions.map(mapStreamSessionToRecord);
	}

	async save(record) {
		const prisma = await this._client();
		const existing = await prisma.streamSession.findUnique({
			where: { sessionId: record.sessionId },
			select: { id: true },
		});

		const data = {
			label: record.label || "",
			ingestSecretHash: record.ingestSecretHash,
			createdByIp: record.createdByIp || "",
			createdByUserId: record.createdByUser || null,
			createdByUsername: record.createdByUsername || "",
			status: toPrismaStreamSessionStatus(record.status),
			transportMode: toPrismaTransportMode(record.transportMode),
			playbackPath: record.playbackPath,
			sharePath: record.sharePath,
			storageBackend: record.storageBackend,
			storagePrefix: record.storagePrefix,
			maxRetainedSegments: record.maxRetainedSegments,
			recentSegmentNames: [...(record.recentSegmentNames || [])],
			lastHeartbeatAt: record.lastHeartbeatAt,
			expiresAt: record.expiresAt,
			cleanupAfterAt: record.cleanupAfterAt,
			endedAt: record.endedAt || null,
		};

		await prisma.$transaction(async (tx) => {
			if (!existing) {
				await tx.streamSession.create({
					data: toPrismaCreateData(record),
				});
				return;
			}

			await tx.streamSession.update({
				where: { sessionId: record.sessionId },
				data,
			});

			await tx.streamAsset.deleteMany({
				where: { sessionId: existing.id },
			});

			if ((record.assets || []).length > 0) {
				await tx.streamAsset.createMany({
					data: record.assets.map((asset) => ({
						sessionId: existing.id,
						filename: asset.filename,
						storageKey: asset.storageKey,
						assetKind: toPrismaAssetKind(asset.assetKind),
						contentType: asset.contentType,
						byteSize: asset.byteSize,
						createdAt: asset.createdAt || new Date(),
						updatedAt: asset.updatedAt || new Date(),
						lastServedAt: asset.lastServedAt || null,
					})),
				});
			}
		});

		return this.findBySessionId(record.sessionId);
	}

	async deleteById(id) {
		const prisma = await this._client();
		return prisma.streamSession.delete({ where: { id } });
	}

	async updateAssetServedAt(sessionId, filename, servedAt = new Date()) {
		const prisma = await this._client();
		const session = await prisma.streamSession.findUnique({
			where: { sessionId },
			select: { id: true },
		});
		if (!session) return null;

		return prisma.streamAsset.updateMany({
			where: {
				sessionId: session.id,
				filename,
			},
			data: {
				lastServedAt: servedAt,
			},
		});
	}
}

const resolveStreamSessionBackingStore = (env = process.env) => (env.DATABASE_URL ? "prisma" : "mongo");

const createStreamSessionRepository = ({ backingStore = resolveStreamSessionBackingStore(), model, prisma } = {}) => {
	if (backingStore === "prisma") {
		return new PrismaStreamSessionRepository({ prisma });
	}

	return new MongoStreamSessionRepository({ model });
};

export {
	MongoStreamSessionRepository,
	PrismaStreamSessionRepository,
	createStreamSessionRepository,
	mapStreamSessionToRecord,
	normalizeTransportMode,
	resolveStreamSessionBackingStore,
};
