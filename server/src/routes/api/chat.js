import { Router } from "express";
import { auth } from "../auth.js";
import RoomModel from "../../models/Room.js";
import logger from "../../logger.js";
import rateLimit from "express-rate-limit";

const router = Router();

// ─── MESSAGES RATE LIMITER ─────────────────────────────────────────────────---
// limit paged message requests to 60 per minute per IP
const messagesLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 3000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later." },
});

router.get(
  "/rooms/:roomId/messages",
  messagesLimiter,
  auth.required,
  async (req, res, next) => {
    const { roomId } = req.params;
    const limit = Math.min(parseInt(req.query.limit), 100) || 50;
    const offset = parseInt(req.query.offset) || 0;
    try {
      const meta = await RoomModel.findById(roomId).select("messages").lean();
      if (!meta) return res.sendStatus(404);
      const room = await RoomModel.findById(roomId)
        .populate({
          path: "messages",
          options: { sort: { createdAt: -1 }, skip: offset, limit },
          populate: { path: "sender", select: "displayName avatarUrl" },
        })
        .lean();

      const total = meta.messages.length;

      return res.json({ messages: room.messages, total });
    } catch (err) {
      logger.error("Error fetching paged messages:", err);
      return next(err);
    }
  },
);

export default router;
