import { Router } from "express";
import { auth } from "../auth.js";
import RoomModel from "../../models/Room.js";
import logger from "../../logger.js";

const router = Router();

router.get("/rooms/:roomId/messages", auth.required, async (req, res) => {
  const { roomId } = req.params;
  const limit = parseInt(req.query.limit) || 50;
  const offset = parseInt(req.query.offset) || 0;
  try {
    const room = await RoomModel.findById(roomId).populate({
      path: "messages",
      options: {
        sort: { createdAt: -1 },
        skip: offset,
        limit,
      },
      populate: { path: "sender", select: "displayName avatarUrl" },
    });
    if (!room) return res.sendStatus(404);
    return res.json({ messages: room.messages });
  } catch (err) {
    logger.error("Error fetching paged messages:", err);
    return res.sendStatus(500);
  }
});

export default router;
