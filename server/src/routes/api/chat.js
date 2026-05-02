import mongoose from "mongoose";
import { Router } from "express";
import { auth } from "../auth.js";
import RoomModel from "../../models/Room.js";
import MessageModel from "../../models/Message.js";
import logger from "../../logger.js";
import rateLimit from "express-rate-limit";

const router = Router();

const messagesLimiter = rateLimit({
	windowMs: 60 * 1000,
	max: 3000,
	standardHeaders: true,
	legacyHeaders: false,
	message: { error: "Too many requests, please try again later." },
});

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
			.populate({ path: "attachments", select: "url contentType size originalName" })
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

export default router;
