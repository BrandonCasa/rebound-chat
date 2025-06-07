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
    try {
      const room = await RoomModel.findById(roomId)
        .populate({
          path: "messages",
          options: { sort: { createdAt: 1 } },
          populate: { path: "sender", select: "displayName avatarUrl" },
        })
        .lean();

      if (!room) return res.sendStatus(404);

      const total = room.messages.length;

      return res.json({ messages: room.messages, total });
    } catch (err) {
      logger.error("Error fetching messages:", err);
      return next(err);
    }
  },
);

export default router;
