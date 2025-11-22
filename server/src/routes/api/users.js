import crypto from "crypto";
import { Router } from "express";

import UserModel, { hashRefreshToken } from "../../models/User.js";
import { auth, getAccessToken } from "../auth.js";

import jwt from "jsonwebtoken";
import passport from "passport";

import logger from "../../logger.js";
import { sendFriendRequest, validateFriendById, validateUserById, removeFriend, declineFriend, cancelFriend } from "../../models/helpers/UserHelper.js";

import multer from "multer";
import databaseServer from "../../database/index.js";
import { once } from "events";

import serverWatchers from "../../socketio/watchers.js";
import mongoose from "mongoose";
import rateLimit from "express-rate-limit";

import "dotenv/config";

const router = Router();

const MAX_FILE_SIZE = 8 * 1024 * 1024;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_FILE_SIZE } });

const authLimiter = rateLimit({
        windowMs: 60 * 60 * 1000,
        max: 20,
        standardHeaders: true,
        legacyHeaders: false,
        message: { error: "Too many auth attempts, please try again later." },
});
const modifyLimiter = rateLimit({
        windowMs: 30 * 60 * 1000,
        max: 8,
        standardHeaders: true,
        legacyHeaders: false,
        message: { error: "Too many modification attempts, please try again later." },
});

const generalLimiter = rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 100,
        standardHeaders: true,
        legacyHeaders: false,
        message: { error: "Too many requests, please try again later." },
});

const buildAuthError = (message, status = 401) => {
        const err = new Error(message);
        err.status = status;
        return err;
};

const BASE_COOKIE_OPTIONS = {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
};

const ACCESS_COOKIE_OPTIONS = {
        ...BASE_COOKIE_OPTIONS,
        path: "/",
};

const REFRESH_COOKIE_OPTIONS = {
        ...BASE_COOKIE_OPTIONS,
        path: "/api/users/refresh",
};

const CSRF_COOKIE_OPTIONS = {
        httpOnly: false,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        path: "/",
};

const setCsrfCookie = (res) => {
        const csrfToken = crypto.randomBytes(32).toString("hex");
        res.cookie("csrfToken", csrfToken, CSRF_COOKIE_OPTIONS);
        return csrfToken;
};

const setAuthCookies = (res, accessToken, refreshToken) => {
        res.cookie("token", accessToken, ACCESS_COOKIE_OPTIONS);
        if (refreshToken) {
                res.cookie("jid", refreshToken, REFRESH_COOKIE_OPTIONS);
        }
        return setCsrfCookie(res);
};

const validateAccessToken = async (token) => {
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

        return { user, decoded };
};

const authenticateFromRequest = (req) => validateAccessToken(getAccessToken(req));

const handleAuthFailure = (err, res, context) => {
        logger.error(`${context}: ${err.message}`);
        return res.status(err.status || 401).json({ error: err.message });
};

router.post("/users/verify", authLimiter, async (req, res, next) => {
        const token = getAccessToken(req);

        try {
                const { user } = await validateAccessToken(token);
                return res.json({ user: user.toAuthJSON(token) });
        } catch (err) {
                logger.error(`Verification error: ${err.message}`);
                return res.status(err.status || 401).json({ error: err.message });
        }
});

router.post("/users/refresh", async (req, res, next) => {
	const rawToken = req.cookies?.jid;
	if (!rawToken) {
		return res.status(401).json({ error: "Missing refresh token" });
	}

	try {
		const payload = jwt.verify(rawToken, process.env.REFRESH_TOKEN_SECRET);

		const user = await UserModel.findById(payload.id);
		if (!user || !user.active) {
			return res.status(401).json({ error: "Invalid user" });
		}

                if (user.tokenVersion !== payload.tokenVersion) {
                        return res.status(401).json({ error: "Token no longer valid" });
                }

                const tokenHash = hashRefreshToken(rawToken);
                const stored = user.refreshTokens.find((t) => t.tokenHash === tokenHash && t.expiresAt > new Date());

                if (!stored) {
                        return res.status(401).json({ error: "Refresh token revoked or expired" });
                }

                user.refreshTokens = user.refreshTokens.filter((t) => t.tokenHash !== tokenHash);
                await user.save();

                const newAccessToken = user.generateAccessToken();
                const newRefreshToken = await user.generateRefreshToken();

                const csrfToken = setAuthCookies(res, newAccessToken, newRefreshToken);

                res.json({ token: newAccessToken, csrfToken });
        } catch (err) {
                logger.error(`Refresh error: ${err.message}`);
                return res.status(401).json({ error: "Invalid refresh token" });
        }
});

router.get("/users/profile", generalLimiter, auth.required, async (req, res, next) => {
        const token = getAccessToken(req);
        try {
                const { user: requestingUser, decoded } = await validateAccessToken(token);
                const targetUserId = req.query.id || decoded.id;
                const user = await UserModel.findById(targetUserId);

                if (!user) {
                        return res.sendStatus(404);
                }

                const profile =
                        decoded.id === user._id.toString()
                                ? await user.toProfilePrivJSON(requestingUser)
                                : await user.toProfilePubJSON(requestingUser);

                return res.json({ user: profile });
        } catch (err) {
                logger.error(`Profile retrieval error: ${err.message}`);
                return res.status(err.status || 401).json({ error: err.message });
        }
});

router.get("/users/google", passport.authenticate("google", { scope: ["profile", "email"] }));
router.get("/users/google/callback", passport.authenticate("google", { session: false, failureRedirect: "/" }), async (req, res, next) => {
                try {
                        const accessToken = req.user.generateAccessToken();
                        const refreshToken = await req.user.generateRefreshToken();

                        setAuthCookies(res, accessToken, refreshToken);

                        const redirectBase = process.env.NODE_ENV === "development" ? "http://localhost:3000" : "";
                        return res.redirect(redirectBase || "/");
                } catch (e) {
                        logger.error(`Google callback token error: ${e.message}`);
                        next(e);
                }
});
router.post("/users/login", authLimiter, (req, res, next) => {
	if (!req.body?.user?.email) {
		return res.status(422).json({ errors: { email: "is required" } });
	}
	if (!req.body?.user?.password) {
		return res.status(422).json({ errors: { password: "is required" } });
	}

	passport.authenticate("local", { session: false }, async (err, user, info) => {
		if (err) {
			logger.error(`Login error: ${err.message}`);
			return next(err);
		}
		if (!user) {
			return res.status(422).json(info);
		}

                try {
                        const accessToken = user.generateAccessToken();
                        const refreshToken = await user.generateRefreshToken();

                        const csrfToken = setAuthCookies(res, accessToken, refreshToken);

                        res.json({ user: user.toAuthJSON(accessToken), csrfToken });
                } catch (e) {
                        logger.error(`Token generation error: ${e.message}`);
                        return next(e);
                }
        })(req, res, next);
});

router.post("/users/register", authLimiter, async (req, res, next) => {
        try {
                const { username, email, displayName, bio, password } = req.body.user;
                if (!password || password.trim().length < 8) {
                        return res.status(422).json({ errors: { password: "is invalid" } });
                }
                const user = new UserModel({ username, email, displayName, bio });
                user.setPassword(password);

                await user.save();

                const accessToken = user.generateAccessToken();
                const refreshToken = await user.generateRefreshToken();

                const csrfToken = setAuthCookies(res, accessToken, refreshToken);

                return res.json({ user: user.toAuthJSON(accessToken), csrfToken });
        } catch (err) {
                logger.error(`Registration error: ${err.message}`);
                return next(err);
        }
});

router.put(
        "/users/modify",
        modifyLimiter,
        auth.required,
	upload.fields([
		{ name: "banner", maxCount: 1 },
		{ name: "avatar", maxCount: 1 },
	]),
        async (req, res, next) => {
                let authContext;
                try {
                        authContext = await authenticateFromRequest(req);
                } catch (err) {
                        return handleAuthFailure(err, res, "Token verification error in modify");
                }
                const { decoded } = authContext;

                const session = await mongoose.startSession();
                try {
                        await session.withTransaction(async () => {
                                const user = await UserModel.findById(decoded.id).session(session).exec();
                                if (!user) {
                                        const err = new Error("User not found");
                                        err.status = 404;
                                        throw err;
                                }

                                const { displayName, bio } = req.body;
                                if (displayName != null) user.displayName = displayName;
                                if (bio != null) user.bio = bio;

                                const uploadToGrid = async (file, fieldName) => {
                                        const ext = file.originalname.split(".").pop();
                                        const filename = `${fieldName}-${decoded.id}-${Math.floor(Math.random() * 1000)}-${Date.now()}.${ext}`;
                                        const uploadStream = databaseServer.gridfsBucket.openUploadStream(filename, { contentType: file.mimetype });
                                        uploadStream.end(file.buffer);
                                        await once(uploadStream, "finish");
                                        return filename;
                                };

                                if (req.files?.banner?.[0]) {
                                        if (user.bannerUrl && user.bannerUrl.startsWith("/content/")) {
                                                const oldBanner = user.bannerUrl.replace("/content/", "");
						const [fileDoc] = await databaseServer.gridfsBucket.find({ filename: oldBanner }).toArray();
						if (fileDoc) {
							await databaseServer.gridfsBucket.delete(fileDoc._id);
						}
					}

					const storedName = await uploadToGrid(req.files.banner[0], "banner");
					user.bannerUrl = `/content/${storedName}`;
				}
				if (req.files?.avatar?.[0]) {
					if (user.avatarUrl && user.avatarUrl.startsWith("/content/")) {
						const oldAvatar = user.avatarUrl.replace("/content/", "");
						const [fileDoc] = await databaseServer.gridfsBucket.find({ filename: oldAvatar }).toArray();
						if (fileDoc) {
							await databaseServer.gridfsBucket.delete(fileDoc._id);
						}
					}

                                        const storedName = await uploadToGrid(req.files.avatar[0], "avatar");
                                        user.avatarUrl = `/content/${storedName}`;
                                }

                                await user.save({ session });
                        });

                        serverWatchers.onUserSaved(decoded.id.toString());
                        const updated = await UserModel.findById(decoded.id).exec();
                        const profile = await updated.toProfilePrivJSON(updated);
			return res.json({ user: profile });
                } catch (err) {
                        if (err.status === 404) return res.sendStatus(404);
                        logger.error(`User modification error: ${err.message}`);
                        return next(err);
                } finally {
                        session.endSession();
                }
        }
);

router.put("/users/addfriend", generalLimiter, auth.required, async (req, res, next) => {
        let authContext;
        try {
        authContext = await authenticateFromRequest(req);
        } catch (err) {
                return handleAuthFailure(err, res, "Token verification error in addfriend");
        }

        const { decoded, user: sender } = authContext;

        if (decoded.id === req.body.recipientId) {
                return res.sendStatus(403);
        }

        try {
                const recipient = await validateUserById(req.body.recipientId);
                const result = await sendFriendRequest(sender, recipient);
                return res.json(result);
        } catch (err) {
		logger.error(`Add friend error: ${err.message}`);
		return next(err);
	}
});

router.put("/users/acceptfriend", generalLimiter, auth.required, async (req, res, next) => {
        let authContext;
        try {
        authContext = await authenticateFromRequest(req);
        } catch (err) {
                return handleAuthFailure(err, res, "Token verification error in acceptfriend");
        }

        try {
                const friend = await validateFriendById(req.body.friendId);
                if (friend.confirmed) {
                        return res.sendStatus(403);
                }
                if (friend.recipient.toString() !== authContext.decoded.id) {
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

router.put("/users/declinefriend", generalLimiter, auth.required, async (req, res, next) => {
        let authContext;
        try {
        authContext = await authenticateFromRequest(req);
        } catch (err) {
                return handleAuthFailure(err, res, "Token verification error in declinefriend");
        }

        try {
                await declineFriend(req.body.friendId, authContext.decoded.id);
                return res.sendStatus(200);
        } catch (err) {
                logger.error(`Decline friend error: ${err.message}`);
                return next(err);
        }
});

router.put("/users/cancelfriend", generalLimiter, auth.required, async (req, res, next) => {
        let authContext;
        try {
        authContext = await authenticateFromRequest(req);
        } catch (err) {
                return handleAuthFailure(err, res, "Token verification error in cancelfriend");
        }

        try {
                await cancelFriend(req.body.friendId, authContext.decoded.id);
                return res.sendStatus(200);
        } catch (err) {
                logger.error(`Cancel friend error: ${err.message}`);
                return next(err);
        }
});

router.put("/users/removefriend", generalLimiter, auth.required, async (req, res, next) => {
        let authContext;
        try {
        authContext = await authenticateFromRequest(req);
        } catch (err) {
                return handleAuthFailure(err, res, "Token verification error in removefriend");
        }

        try {
                await removeFriend(req.body.friendId, authContext.decoded.id);
                return res.sendStatus(200);
        } catch (err) {
                logger.error(`Remove friend error: ${err.message}`);
                return next(err);
        }
});

export default router;
