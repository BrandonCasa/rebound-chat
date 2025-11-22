import { Router } from "express";
import jwt from "jsonwebtoken";
import { auth, getAccessToken } from "../auth.js";
import DmThreadModel from "../../models/DmThread.js";
import MessageModel from "../../models/Message.js";
import UserModel from "../../models/User.js";
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

const buildAuthError = (message, status = 401) => {
        const err = new Error(message);
        err.status = status;
        return err;
};

const validateAccessToken = async (req) => {
        const token = getAccessToken(req);
        if (!token) throw buildAuthError("Missing access token.");

        let decoded;
        try {
                decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
        } catch (err) {
                throw buildAuthError("Invalid access token.");
        }

        const user = await UserModel.findById(decoded.id);
        if (!user || !user.active) {
                throw buildAuthError("Invalid or deactivated account.");
        }

        if (decoded.tokenVersion !== user.tokenVersion) {
                throw buildAuthError("Token no longer valid.");
        }

        if (user.passwordChangedAt && decoded.iat * 1000 < user.passwordChangedAt.getTime()) {
                throw buildAuthError("Token issued before password change.");
        }

        return { decoded };
};

async function getThread(userId, otherId) {
	if (userId === otherId) return;
	let thread = await DmThreadModel.findOne({
		participants: { $all: [userId, otherId], $size: 2 },
	}).populate({
		path: "messages",
		options: { sort: { createdAt: 1 } },
		populate: { path: "sender", select: "displayName avatarUrl" },
	});
	if (!thread) {
		thread = new DmThreadModel({ participants: [userId, otherId], messages: [] });
		await thread.save();
	}
	return thread;
}

router.get("/dms/:userId/messages", messagesLimiter, auth.required, async (req, res, next) => {
        try {
                const { decoded } = await validateAccessToken(req);
                const otherId = req.params.userId;
                if (decoded.id === otherId) return res.status(400).json({ error: "Cannot message yourself" });
                if (!(await UserModel.exists({ _id: otherId }))) return res.sendStatus(404);
                const thread = await getThread(decoded.id, otherId);
                return res.json({ threadId: thread._id, messages: thread.messages });
        } catch (err) {
                logger.error("Error fetching DM messages:", err);
                if (err.status) return res.status(err.status).json({ error: err.message });
                return next(err);
        }
});

router.post("/dms/:userId/messages", auth.required, async (req, res, next) => {
        try {
                const { decoded } = await validateAccessToken(req);
                const otherId = req.params.userId;
                if (decoded.id === otherId) return res.status(400).json({ error: "Cannot message yourself" });
                const { content } = req.body;
                if (!content) return res.status(400).json({ error: "Content required" });
                if (!(await UserModel.exists({ _id: otherId }))) return res.sendStatus(404);
                const thread = await getThread(decoded.id, otherId);
                const msg = new MessageModel({ sender: decoded.id, content });
                await msg.save();
                thread.messages.push(msg);
                await thread.save();
                await thread.populate({
                        path: "messages",
                        options: { sort: { createdAt: 1 } },
                        populate: { path: "sender", select: "displayName avatarUrl" },
                });
                return res.json({ threadId: thread._id, messages: thread.messages });
        } catch (err) {
                logger.error("Error sending DM:", err);
                if (err.status) return res.status(err.status).json({ error: err.message });
                return next(err);
        }
});

export default router;
