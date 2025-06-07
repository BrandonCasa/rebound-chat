import { Router } from "express";

import UserModel from "../../models/User.js";
import { auth, getTokenFromHeader } from "../auth.js";

import jwt from "jsonwebtoken";
import passport from "passport";

import logger from "../../logger.js";
import { sendFriendRequest, validateFriendById, validateUserById, removeFriend, declineFriend, cancelFriend } from "../../models/helpers/UserHelper.js";

import multer from "multer";
import databaseServer from "../../database/index.js"; // <— your DatabaseServer instance
import { once } from "events";

import serverWatchers from "../../socketio/watchers.js";
import mongoose from "mongoose";
import rateLimit from "express-rate-limit";

import "dotenv/config";

const router = Router();

const upload = multer({ storage: multer.memoryStorage() });

// ─── AUTH RATE LIMITER ────────────────────────────────────────────────────────
// max 10 login/register attempts per hour per IP
const authLimiter = rateLimit({
	windowMs: 60 * 60 * 1000, // 1 hour
	max: 20,
	standardHeaders: true,
	legacyHeaders: false,
	message: { error: "Too many auth attempts, please try again later." },
});
// ─── MODIFY RATE LIMITER ────────────────────────────────────────────────────────
// max 8 modify profile attempts per 30 minutes per IP
const modifyLimiter = rateLimit({
	windowMs: 30 * 60 * 1000, // 1 hour
	max: 8,
	standardHeaders: true,
	legacyHeaders: false,
	message: { error: "Too many modification attempts, please try again later." },
});

// ─── GENERAL RATE LIMITER ─────────────────────────────────────────────────────
// fallback limiter for other user endpoints
const generalLimiter = rateLimit({
	windowMs: 15 * 60 * 1000, // 15 minutes
	max: 100,
	standardHeaders: true,
	legacyHeaders: false,
	message: { error: "Too many requests, please try again later." },
});

/**
 * /users/verify
 * Verify a user via token. Checks that the account is active and returns authentication data.
 */
router.post("/users/verify", generalLimiter, async (req, res, next) => {
	const token = getTokenFromHeader(req);

	try {
		const decoded = jwt.verify(token, process.env.SECRET);
		const user = await UserModel.findById(decoded.id);
		if (!user || user.active === false) {
			return res.status(401).json({ error: "Invalid or deactivated account." });
		}
		return res.json({ user: user.toAuthJSON() });
	} catch (err) {
		logger.error(`Verification error: ${err.message}`);
		return next(err);
	}
});

/**
 * /users/profile
 * Retrieve a user's profile.
 * If a query parameter id is provided and does not match the requesting user,
 * returns the public profile (with mutual friend and server info).
 * Otherwise, returns the private profile.
 */
router.get("/users/profile", generalLimiter, auth.required, async (req, res, next) => {
	const token = getTokenFromHeader(req);
	try {
		const decoded = jwt.verify(token, process.env.SECRET);
		// Use provided id if any, otherwise default to the logged-in user's id.
		const targetUserId = req.query.id || decoded.id;
		const user = await UserModel.findById(targetUserId);

		if (!user) {
			return res.sendStatus(404);
		}

		let profile;
		// If the request is for the owner's profile, return the private version.
		if (decoded.id === user._id.toString()) {
			profile = await user.toProfilePrivJSON(user);
		} else {
			// For public profile, fetch the querying user's document to calculate mutual fields.
			const queryingUser = await UserModel.findById(decoded.id);
			profile = await user.toProfilePubJSON(queryingUser);
		}

		return res.json({ user: profile });
	} catch (err) {
		logger.error(`Profile retrieval error: ${err.message}`);
		return next(err);
	}
});

/**
 * /users/login
 * Log in a user using passport local strategy.
 */
router.post("/users/login", authLimiter, (req, res, next) => {
	if (!req.body?.user?.email) {
		return res.status(422).json({ errors: { email: "is required" } });
	}
	if (!req.body?.user?.password) {
		return res.status(422).json({ errors: { password: "is required" } });
	}

	passport.authenticate("local", { session: false }, (err, user, info) => {
		if (err) {
			logger.error(`Login error: ${err.message}`);
			return next(err);
		}
		if (user) {
			return res.json({ user: user.toAuthJSON() });
		} else {
			return res.status(422).json(info);
		}
	})(req, res, next);
});

/**
 * /users/register
 * Register a new user. Checks for a password with a minimum length.
 */
router.post("/users/register", authLimiter, async (req, res, next) => {
	try {
		const { username, email, displayName, bio, password } = req.body.user;
		if (!password || password.trim().length < 8) {
			return res.status(422).json({ errors: { password: "is invalid" } });
		}
		const user = new UserModel({ username, email, displayName, bio });
		user.setPassword(password);

		await user.save();
		return res.json({ user: user.toAuthJSON() });
	} catch (err) {
		logger.error(`Registration error: ${err.message}`);
		return next(err);
	}
});

/**
 * /users/modify
 * Update fields of the user's profile.
 * This endpoint uses a transaction, which is important for replica sets.
 */
router.put(
	"/users/modify",
	modifyLimiter,
	auth.required,
	upload.fields([
		{ name: "banner", maxCount: 1 },
		{ name: "avatar", maxCount: 1 },
	]),
	async (req, res, next) => {
		// 1) Verify token
		const token = getTokenFromHeader(req);
		let decoded;
		try {
			decoded = jwt.verify(token, process.env.SECRET);
		} catch (err) {
			logger.error(`Token verification error in modify: ${err.message}`);
			return res.sendStatus(401);
		}

		// 2) Start a session & transaction
		const session = await mongoose.startSession();
		try {
			await session.withTransaction(async () => {
				// 3) Load user under the session
				const user = await UserModel.findById(decoded.id).session(session).exec();
				if (!user) {
					// throwing will abort the transaction
					const err = new Error("User not found");
					err.status = 404;
					throw err;
				}

				// 4) Update text fields
				const { displayName, bio } = req.body;
				if (displayName != null) user.displayName = displayName;
				if (bio != null) user.bio = bio;

				// 5) File‐upload helper
				const uploadToGrid = async (file, fieldName) => {
					const ext = file.originalname.split(".").pop();
					const filename = `${fieldName}-${decoded.id}-${Date.now()}.${ext}`;
					const uploadStream = databaseServer.gridfsBucket.openUploadStream(filename, { contentType: file.mimetype });
					uploadStream.end(file.buffer);
					await once(uploadStream, "finish");
					return filename;
				};

				// 6) Banner & avatar
				if (req.files?.banner?.[0]) {
					const storedName = await uploadToGrid(req.files.banner[0], "banner");
					user.bannerUrl = `/content/${storedName}`;
				}
				if (req.files?.avatar?.[0]) {
					const storedName = await uploadToGrid(req.files.avatar[0], "avatar");
					user.avatarUrl = `/content/${storedName}`;
				}

				// 7) Persist under the session
				await user.save({ session });
			});

			// 8) After commit succeed: notify watchers & respond
			serverWatchers.onUserSaved(decoded.id.toString());
			const updated = await UserModel.findById(decoded.id).exec();
			const profile = await updated.toProfilePrivJSON(updated);
			return res.json({ user: profile });
		} catch (err) {
			// If you threw an Error with a .status, honor it:
			if (err.status === 404) return res.sendStatus(404);
			logger.error(`User modification error: ${err.message}`);
			return next(err);
		} finally {
			session.endSession();
		}
	}
);

/**
 * Friend-related endpoints
 */

/**
 * /users/addfriend
 * Send a friend request.
 * The sender is the authenticated user and the recipient is provided in the request body.
 */
router.put("/users/addfriend", generalLimiter, auth.required, async (req, res, next) => {
	const token = getTokenFromHeader(req);
	let decoded;
	try {
		decoded = jwt.verify(token, process.env.SECRET);
	} catch (err) {
		logger.error(`Token verification error in addfriend: ${err.message}`);
		return res.sendStatus(401);
	}

	// Prevent a user from sending a friend request to themselves.
	if (decoded.id === req.body.recipientId) {
		return res.sendStatus(403);
	}

	try {
		const sender = await validateUserById(decoded.id);
		const recipient = await validateUserById(req.body.recipientId);
		const result = await sendFriendRequest(sender, recipient);
		return res.json(result);
	} catch (err) {
		logger.error(`Add friend error: ${err.message}`);
		return next(err);
	}
});

/**
 * /users/acceptfriend
 * Accept a pending friend request.
 * Only the intended recipient may confirm the request.
 */
router.put("/users/acceptfriend", generalLimiter, auth.required, async (req, res, next) => {
	const token = getTokenFromHeader(req);
	let decoded;
	try {
		decoded = jwt.verify(token, process.env.SECRET);
	} catch (err) {
		logger.error(`Token verification error in acceptfriend: ${err.message}`);
		return res.sendStatus(401);
	}

	try {
		const friend = await validateFriendById(req.body.friendId);
		if (friend.confirmed) {
			return res.sendStatus(403);
		}
		if (friend.recipient.toString() !== decoded.id) {
			return res.sendStatus(401);
		}
		friend.confirmed = true;
		await friend.save();
		return res.sendStatus(200);
	} catch (err) {
		logger.error(`Accept friend error: ${err.message}`);
		return next(err);
	}
});

/**
 * /users/declinefriend
 * Decline a pending friend request.
 */
router.put("/users/declinefriend", generalLimiter, auth.required, async (req, res, next) => {
	const token = getTokenFromHeader(req);
	let decoded;
	try {
		decoded = jwt.verify(token, process.env.SECRET);
	} catch (err) {
		logger.error(`Token verification error in declinefriend: ${err.message}`);
		return res.sendStatus(401);
	}

	try {
		// Call declineFriend with the friend request ID and current user ID.
		await declineFriend(req.body.friendId, decoded.id);
		return res.sendStatus(200);
	} catch (err) {
		logger.error(`Decline friend error: ${err.message}`);
		return next(err);
	}
});

/**
 * /users/cancelfriend
 * Cancel a sent friend request.
 */
router.put("/users/cancelfriend", generalLimiter, auth.required, async (req, res, next) => {
	const token = getTokenFromHeader(req);
	let decoded;
	try {
		decoded = jwt.verify(token, process.env.SECRET);
	} catch (err) {
		logger.error(`Token verification error in cancelfriend: ${err.message}`);
		return res.sendStatus(401);
	}

	try {
		await cancelFriend(req.body.friendId, decoded.id);
		return res.sendStatus(200);
	} catch (err) {
		logger.error(`Cancel friend error: ${err.message}`);
		return next(err);
	}
});

/**
 * /users/removefriend
 * Remove an existing friend.
 */
router.put("/users/removefriend", generalLimiter, auth.required, async (req, res, next) => {
	const token = getTokenFromHeader(req);
	let decoded;
	try {
		decoded = jwt.verify(token, process.env.SECRET);
	} catch (err) {
		logger.error(`Token verification error in removefriend: ${err.message}`);
		return res.sendStatus(401);
	}

	try {
		await removeFriend(req.body.friendId, decoded.id);
		return res.sendStatus(200);
	} catch (err) {
		logger.error(`Remove friend error: ${err.message}`);
		return next(err);
	}
});

export default router;
