import mongoose from "mongoose";
import { Router } from "express";
import { auth } from "../auth.js";
import RoomModel from "../../models/Room.js";
import MessageModel from "../../models/Message.js";
import logger from "../../logger.js";
import rateLimit from "express-rate-limit";
import multer from "multer";
import { once } from "events";
import path from "path";
import databaseServer from "../../database/index.js";

const router = Router();

const MAX_IMAGE_FILE_SIZE = 1 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

const upload = multer({
	storage: multer.memoryStorage(),
	limits: { fileSize: MAX_IMAGE_FILE_SIZE },
	fileFilter: (_req, file, cb) => {
		if (!ALLOWED_IMAGE_TYPES.has(file.mimetype)) {
			cb(new multer.MulterError("LIMIT_UNEXPECTED_FILE"));
			return;
		}

		cb(null, true);
	},
});

const messagesLimiter = rateLimit({
	windowMs: 60 * 1000,
	max: 3000,
	standardHeaders: true,
	legacyHeaders: false,
	message: { error: "Too many requests, please try again later." },
});

router.post("/rooms/:roomId/media", messagesLimiter, auth.required, upload.single("file"), async (req, res, next) => {
	try {
		const bucket = databaseServer.gridfsBucket;
		if (!bucket) {
			return res.status(503).json({ error: "File store not ready" });
		}

		const { roomId } = req.params;
		const roomExists = await RoomModel.exists({ _id: roomId });
		if (!roomExists) {
			return res.status(404).json({ error: "Room not found" });
		}

		if (!req.file) {
			return res.status(400).json({ error: "Image file is required." });
		}

		const { mimetype, size, originalname } = req.file;

		if (!ALLOWED_IMAGE_TYPES.has(mimetype)) {
			return res.status(400).json({ error: "Only PNG, JPEG, WEBP, or GIF images are supported." });
		}

		const filename = generateStoredFilename(roomId, originalname);
		await uploadFileToGrid(bucket, req.file, filename);

		return res.status(201).json({
			attachment: {
				url: `/content/${filename}`,
				contentType: mimetype,
				size,
				originalName: originalname,
			},
		});
	} catch (err) {
		logger.error("Error uploading chat media:", err);

		if (err instanceof multer.MulterError) {
			if (err.code === "LIMIT_FILE_SIZE") {
				return res.status(400).json({ error: "Images must be 1MB or smaller." });
			}

			return res.status(400).json({ error: "Unable to upload image." });
		}

		return next(err);
	}
});

const generateStoredFilename = (roomId, originalName) => {
	const ext = path.extname(originalName || "").replace(/[^A-Za-z0-9.]/g, "");
	const suffix = Math.random().toString(36).slice(2, 8);
	return `room-${roomId}-${Date.now()}-${suffix}${ext || ""}`;
};

const uploadFileToGrid = async (bucket, file, filename) => {
	const uploadStream = bucket.openUploadStream(filename, { contentType: file.mimetype });
	uploadStream.end(file.buffer);
	await once(uploadStream, "finish");
};

router.get("/rooms/:roomId/messages", messagesLimiter, auth.required, async (req, res, next) => {
	const { roomId } = req.params;
	const { before, after, limit: limitParam } = req.query;
	const DEFAULT_LIMIT = 50;

	try {
		const room = await RoomModel.findById(roomId).select("messages").lean();
		if (!room) return res.sendStatus(404);

		const messageIds = room.messages ?? [];
		const limit = Math.min(Math.max(parseInt(limitParam, 10) || DEFAULT_LIMIT, 1), 100);

		const cursorQuery = { _id: { $in: messageIds } };
		const buildCursor = (value, operator) => {
			if (!value) return;
			try {
				const objectId = new mongoose.Types.ObjectId(value);
				cursorQuery._id[operator] = objectId;
			} catch (err) {
				throw new Error("Invalid cursor value supplied.");
			}
		};

		buildCursor(before, "$lt");
		buildCursor(after, "$gt");

		const results = await MessageModel.find(cursorQuery)
			.sort({ _id: -1 })
			.limit(limit + 1)
			.populate({ path: "sender", select: "displayName avatarUrl" })
			.lean();

		const hasExtra = results.length > limit;
		const messages = results.slice(0, limit).reverse();

		const pageInfo = {
			hasMoreBefore: before || !after ? hasExtra : false,
			hasMoreAfter: Boolean(after && hasExtra),
			nextBefore: messages[0]?._id ?? null,
			nextAfter: messages[messages.length - 1]?._id ?? null,
		};

		return res.json({ messages, pageInfo });
	} catch (err) {
		if (err.message === "Invalid cursor value supplied.") {
			return res.status(400).json({ error: err.message });
		}

		logger.error("Error fetching messages:", err);
		return next(err);
	}
});

router.use((err, _req, res, next) => {
	if (err instanceof multer.MulterError) {
		if (err.code === "LIMIT_FILE_SIZE") {
			return res.status(400).json({ error: "Images must be 1MB or smaller." });
		}

		if (err.code === "LIMIT_UNEXPECTED_FILE") {
			return res.status(400).json({ error: "Only PNG, JPEG, WEBP, or GIF images are supported." });
		}

		return res.status(400).json({ error: "Unable to upload image." });
	}

	return next(err);
});

export default router;
