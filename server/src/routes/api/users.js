import { Router } from "express";

import UserModel, { hashPasswordResetToken, hashRefreshToken } from "../../models/User.js";
import { auth } from "../auth.js";

import jwt from "jsonwebtoken";
import nodemailer from "nodemailer";
import passport from "passport";

import logger from "../../logger.js";
import { sendFriendRequest, validateFriendById, validateUserById, removeFriend, declineFriend, cancelFriend } from "../../models/helpers/UserHelper.js";

import multer from "multer";
import databaseServer from "../../database/index.js";
import { once } from "events";

import serverWatchers from "../../socketio/watchers.js";
import mongoose from "mongoose";
import rateLimit from "express-rate-limit";

import { buildRequestTokenDescriptor, createAuthContextMiddleware, parseCookieHeader, sanitizeIpAddress, resolveGoogleCallbackUrl } from "../../utils/auth.js";
import { CSRF_COOKIE_NAME, CSRF_COOKIE_OPTIONS, createCsrfToken, setCsrfResponseHeaders } from "../../utils/csrf.js";

import "dotenv/config";

const router = Router();

const MAX_FILE_SIZE = 8 * 1024 * 1024;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_FILE_SIZE } });

const authLimiter = rateLimit({
	windowMs: 60 * 60 * 1000,
	max: process.env.NODE_ENV === "test" ? 1000 : 500,
	standardHeaders: true,
	legacyHeaders: false,
	message: { error: "Too many auth attempts, please try again later." },
});

const requireAuthContext = (context) => createAuthContextMiddleware(context, logger);
const modifyLimiter = rateLimit({
	windowMs: 30 * 60 * 1000,
	max: 200,
	standardHeaders: true,
	legacyHeaders: false,
	message: { error: "Too many modification attempts, please try again later." },
});

const generalLimiter = rateLimit({
	windowMs: 15 * 60 * 1000,
	max: 500,
	standardHeaders: true,
	legacyHeaders: false,
	message: { error: "Too many requests, please try again later." },
});

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

const AUTH_SESSION_COOKIE_NAME = "auth-session-present";

const AUTH_SESSION_COOKIE_OPTIONS = {
	httpOnly: false,
	secure: process.env.NODE_ENV === "production",
	sameSite: "strict",
	path: "/",
};

const PASSWORD_RESET_RESPONSE = {
	success: true,
	message: "If an account exists for that email, a password reset link has been sent.",
};

const PASSWORD_RESET_TOKEN_PATTERN = /^[a-f0-9]{64}$/i;

const shouldExposePasswordResetToken = () => process.env.NODE_ENV !== "production" || process.env.EXPOSE_PASSWORD_RESET_TOKEN === "true";

const normalizeEmail = (email) => (typeof email === "string" ? email.trim().toLowerCase() : "");

const resolvePasswordResetBaseUrl = (req) => {
	if (process.env.PASSWORD_RESET_URL_BASE) return process.env.PASSWORD_RESET_URL_BASE;
	const clientTarget = resolveClientRedirectTarget(req);
	return clientTarget || "/";
};

const buildPasswordResetUrl = (req, token) => {
	const base = resolvePasswordResetBaseUrl(req);
	const separator = base.includes("?") ? "&" : "?";
	return `${base}${separator}resetToken=${encodeURIComponent(token)}`;
};

const createPasswordResetTransport = () => {
	if (!process.env.SMTP_HOST) return null;

	return nodemailer.createTransport({
		host: process.env.SMTP_HOST,
		port: Number(process.env.SMTP_PORT || 587),
		secure: process.env.SMTP_SECURE === "true",
		auth:
			process.env.SMTP_USER && process.env.SMTP_PASS
				? {
						user: process.env.SMTP_USER,
						pass: process.env.SMTP_PASS,
					}
				: undefined,
	});
};

const escapeHtml = (value) => String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const buildPasswordResetEmail = (user, resetUrl) => ({
	from: process.env.PASSWORD_RESET_FROM || process.env.SMTP_FROM || "Rebound <no-reply@rebound.nexus>",
	to: user.email,
	subject: "Reset your Rebound password",
	text: [
		"We received a request to reset your Rebound password.",
		"",
		`Use this secure link within one hour: ${resetUrl}`,
		"",
		"If you did not request this, you can ignore this email.",
	].join("\n"),
	html: `
		<p>We received a request to reset your Rebound password.</p>
		<p><a href="${escapeHtml(resetUrl)}">Reset your password</a></p>
		<p>This link expires in one hour. If you did not request this, you can ignore this email.</p>
	`,
});

const deliverPasswordResetToken = async (req, user, token) => {
	const resetUrl = buildPasswordResetUrl(req, token);
	const transport = createPasswordResetTransport();

	if (!transport) {
		logger.warn(`SMTP is not configured. Password reset URL for ${user.email}: ${resetUrl}`);
		return resetUrl;
	}

	await transport.sendMail(buildPasswordResetEmail(user, resetUrl));
	logger.info(`Password reset email sent to ${user.email}.`);
	return resetUrl;
};

const normalizeRedirectTarget = (rawValue) => {
	if (!rawValue) return null;

	try {
		const decoded = decodeURIComponent(rawValue);
		const parsed = new URL(decoded);

		if (parsed.protocol === "app:") {
			if (parsed.host !== "-") return null;
			return `${parsed.protocol}//${parsed.host}${parsed.pathname}${parsed.search}${parsed.hash}`;
		}

		if (["http:", "https:"].includes(parsed.protocol)) {
			const allowedHosts = new Set(["rebound.nexus", "www.rebound.nexus", "localhost:3000"]);

			if (!allowedHosts.has(parsed.host)) return null;

			return `${parsed.protocol}//${parsed.host}${parsed.pathname}${parsed.search}${parsed.hash}`;
		}

		return null;
	} catch {
		return null;
	}
};

const resolveClientRedirectTarget = (req) => {
	if (process.env.CLIENT_REDIRECT_BASE) return process.env.CLIENT_REDIRECT_BASE;

	const explicitTarget = normalizeRedirectTarget(req.query?.redirect);
	if (explicitTarget) return explicitTarget;

	const referrerTarget = normalizeRedirectTarget(req.get("referer"));
	if (referrerTarget) return referrerTarget;

	const originTarget = normalizeRedirectTarget(req.get("origin"));
	if (originTarget) return originTarget;

	if (process.env.NODE_ENV === "development") return "http://localhost:3000";

	return "/";
};

const withRedirectParam = (target, key, value) => {
	const [base, hash = ""] = target.split("#", 2);
	return `${base}${base.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(value)}${hash ? `#${hash}` : ""}`;
};

const withAuthErrorParam = (target) => withRedirectParam(target, "authError", "google");
const withAuthSuccessParam = (target) => withRedirectParam(target, "authComplete", "google");

const setCsrfCookie = (res) => {
	const csrfToken = createCsrfToken();
	res.cookie(CSRF_COOKIE_NAME, csrfToken, CSRF_COOKIE_OPTIONS);
	setCsrfResponseHeaders(res, csrfToken);
	return csrfToken;
};

const setAuthSessionCookie = (res) => {
	res.cookie(AUTH_SESSION_COOKIE_NAME, "true", AUTH_SESSION_COOKIE_OPTIONS);
};

const setAuthCookies = (res, accessToken, refreshToken) => {
	res.cookie("token", accessToken, ACCESS_COOKIE_OPTIONS);
	if (refreshToken) {
		res.cookie("jid", refreshToken, REFRESH_COOKIE_OPTIONS);
	}
	setAuthSessionCookie(res);
	return setCsrfCookie(res);
};

const clearAuthCookies = (res) => {
	res.clearCookie("token", ACCESS_COOKIE_OPTIONS);
	res.clearCookie("jid", REFRESH_COOKIE_OPTIONS);
	res.clearCookie(CSRF_COOKIE_NAME, CSRF_COOKIE_OPTIONS);
	res.clearCookie(AUTH_SESSION_COOKIE_NAME, AUTH_SESSION_COOKIE_OPTIONS);
};

const resolveCurrentRefreshTokenHash = (req, user) => {
	const rawToken = req.cookies?.jid || parseCookieHeader(req.headers?.cookie || "")?.jid;
	if (rawToken) return hashRefreshToken(rawToken);

	const accessIssuedAtMs = req.authContext?.decoded?.iat ? req.authContext.decoded.iat * 1000 : null;
	if (!accessIssuedAtMs || !Array.isArray(user?.refreshTokens)) return null;

	const WINDOW_MS = 5 * 60 * 1000; // 5 minutes grace between issued access token and stored refresh record

	let nearest = null;
	for (const token of user.refreshTokens) {
		if (!token?.lastUsed) continue;

		const lastUsedMs = token.lastUsed instanceof Date ? token.lastUsed.getTime() : new Date(token.lastUsed).getTime();
		if (Number.isNaN(lastUsedMs)) continue;

		const delta = Math.abs(lastUsedMs - accessIssuedAtMs);
		if (delta <= WINDOW_MS && (!nearest || delta < nearest.delta)) {
			nearest = { delta, tokenHash: token.tokenHash };
		}
	}

	return nearest?.tokenHash || null;
};

const normalizeUnknownString = (value) => {
	if (!value) return null;
	const trimmed = String(value).trim();
	return trimmed && trimmed.toLowerCase() !== "unknown" ? trimmed : null;
};

const normalizeRefreshSession = (tokenRecord, currentTokenHash = null) => {
	if (!tokenRecord) return null;

	const { _id, tokenHash, userAgent, userAgentParsed, userAgentDeviceType, deviceName, ipAddress, location, lastUsed, expiresAt } = tokenRecord;

	if (!_id) return null;

	const normalizedIpAddress = sanitizeIpAddress(ipAddress);
	const normalizedIp = normalizedIpAddress || normalizeUnknownString(ipAddress) || "Unknown";
	const normalizedLocation = normalizeUnknownString(location) || normalizedIpAddress || normalizeUnknownString(ipAddress) || "Unknown";
	const userAgentDisplay = normalizeUnknownString(userAgentParsed) || normalizeUnknownString(userAgent) || "Unknown";
	const deviceLabel = normalizeUnknownString(deviceName) || userAgentDisplay || "Unknown device";
	const deviceType = normalizeUnknownString(userAgentDeviceType) || "desktop";

	return {
		id: _id.toString(),
		userAgent: userAgentDisplay,
		userAgentParsed: userAgentDisplay,
		userAgentDeviceType: deviceType,
		deviceName: deviceLabel,
		ipAddress: normalizedIp,
		location: normalizedLocation,
		lastActive: lastUsed || expiresAt,
		isCurrent: Boolean(currentTokenHash && tokenHash === currentTokenHash),
	};
};

const generateStoredFilename = (fieldName, userId, originalName) => {
	const ext = originalName.split(".").pop();
	return `${fieldName}-${userId}-${Math.floor(Math.random() * 1000)}-${Date.now()}.${ext}`;
};

const deleteExistingGridFile = async (bucket, currentUrl) => {
	if (!currentUrl || !currentUrl.startsWith("/content/")) return;

	const existingName = currentUrl.replace("/content/", "");
	const [fileDoc] = await bucket.find({ filename: existingName }).toArray();
	if (fileDoc) {
		await bucket.delete(fileDoc._id);
	}
};

const uploadFileToGrid = async (bucket, file, filename) => {
	const uploadStream = bucket.openUploadStream(filename, { contentType: file.mimetype });
	uploadStream.end(file.buffer);
	await once(uploadStream, "finish");
};

const processFileUpload = async (bucket, file, fieldName, userId, currentUrl) => {
	if (!file) return currentUrl;

	await deleteExistingGridFile(bucket, currentUrl);
	const filename = generateStoredFilename(fieldName, userId, file.originalname);
	await uploadFileToGrid(bucket, file, filename);
	return `/content/${filename}`;
};

const friendAction = (label, action) => {
	return async (req, res, next) => {
		try {
			await action(req, res);
		} catch (err) {
			logger.error(`${label} error: ${err.message}`);
			return next(err);
		}
	};
};

router.post("/users/verify", authLimiter, requireAuthContext("Verification error"), (req, res) => {
	const { user, token } = req.authContext;
	return res.json({ user: user.toAuthJSON(token) });
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
		const now = new Date();
		const storedIndex = user.refreshTokens.findIndex((t) => t.tokenHash === tokenHash && t.expiresAt > now);

		if (storedIndex === -1) {
			return res.status(401).json({ error: "Refresh token revoked or expired" });
		}

		const newAccessToken = user.generateAccessToken();
		const newRefreshToken = await user.generateRefreshToken(buildRequestTokenDescriptor(req), tokenHash);

		const csrfToken = setAuthCookies(res, newAccessToken, newRefreshToken);

		res.json({ token: newAccessToken, csrfToken });
	} catch (err) {
		logger.error(`Refresh error: ${err.message}`);
		return res.status(401).json({ error: "Invalid refresh token" });
	}
});

router.get("/users/profile", generalLimiter, auth.required, requireAuthContext("Profile retrieval auth error"), async (req, res, next) => {
	try {
		const { user: requestingUser, decoded } = req.authContext;
		const targetUserId = req.query.id || decoded.id;
		const user = await UserModel.findById(targetUserId);

		if (!user) {
			return res.sendStatus(404);
		}

		const profile = decoded.id === user._id.toString() ? await user.toProfilePrivJSON(requestingUser) : await user.toProfilePubJSON(requestingUser);

		return res.json({ user: profile });
	} catch (err) {
		logger.error(`Profile retrieval error: ${err.message}`);
		return next(err);
	}
});

router.get("/users/sessions", generalLimiter, auth.required, requireAuthContext("Session retrieval auth error"), async (req, res, next) => {
	try {
		const { user } = req.authContext;
		const currentTokenHash = resolveCurrentRefreshTokenHash(req, user);

		user.pruneExpiredRefreshTokens();
		await user.save();

		const sessions = user.refreshTokens.map((token) => normalizeRefreshSession(token, currentTokenHash)).filter(Boolean);

		return res.json({ sessions });
	} catch (err) {
		logger.error(`Session retrieval error: ${err.message}`);
		return next(err);
	}
});

router.get("/users/google", (req, res, next) => {
	const redirectTarget = resolveClientRedirectTarget(req);
	const callbackURL = resolveGoogleCallbackUrl(req);

	if (!callbackURL) {
		logger.error("Unable to resolve Google callback URL from request headers");
		return res.redirect(withAuthErrorParam(redirectTarget));
	}

	return passport.authenticate("google", {
		scope: ["profile", "email"],
		state: redirectTarget,
		callbackURL,
	})(req, res, next);
});
router.get("/users/google/callback", (req, res, next) => {
	const redirectTarget = normalizeRedirectTarget(req.query?.state) || resolveClientRedirectTarget(req);
	const callbackURL = resolveGoogleCallbackUrl(req);
	const redirectWithError = () => res.redirect(withAuthErrorParam(redirectTarget));

	if (!callbackURL) {
		logger.error("Unable to resolve Google callback URL from request headers");
		return redirectWithError();
	}

	return passport.authenticate("google", { session: false, callbackURL }, async (err, user) => {
		if (err || !user) {
			if (err) {
				logger.error(`Google callback auth error: ${err.message}`);
			}
			return redirectWithError();
		}

		try {
			const accessToken = user.generateAccessToken();
			const refreshToken = await user.generateRefreshToken(buildRequestTokenDescriptor(req));

			setAuthCookies(res, accessToken, refreshToken);

			return res.redirect(withAuthSuccessParam(redirectTarget));
		} catch (e) {
			logger.error(`Google callback token error: ${e.message}`);
			return redirectWithError();
		}
	})(req, res, next);
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
			const existingTokenHash = resolveCurrentRefreshTokenHash(req, user);
			const refreshToken = await user.generateRefreshToken(buildRequestTokenDescriptor(req), existingTokenHash);

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
		const refreshToken = await user.generateRefreshToken(buildRequestTokenDescriptor(req));

		const csrfToken = setAuthCookies(res, accessToken, refreshToken);

		return res.json({ user: user.toAuthJSON(accessToken), csrfToken });
	} catch (err) {
		logger.error(`Registration error: ${err.message}`);
		return next(err);
	}
});

router.post("/users/password-reset/request", authLimiter, async (req, res, next) => {
	try {
		const email = normalizeEmail(req.body?.email);
		const responseBody = { ...PASSWORD_RESET_RESPONSE };

		if (!email) {
			return res.status(422).json({ errors: { email: "is required" } });
		}

		const user = await UserModel.findOne({ email });
		if (!user || !user.active) {
			return res.json(responseBody);
		}

		const resetToken = user.createPasswordResetToken();
		await user.save();

		let resetUrl = null;
		try {
			resetUrl = await deliverPasswordResetToken(req, user, resetToken);
		} catch (deliveryErr) {
			logger.error(`Password reset email delivery failed for ${user.email}: ${deliveryErr.message}`);
			user.clearPasswordResetToken();
			await user.save();
		}

		if (resetUrl && shouldExposePasswordResetToken()) {
			responseBody.resetToken = resetToken;
			responseBody.resetUrl = resetUrl;
		}

		return res.json(responseBody);
	} catch (err) {
		logger.error(`Password reset request error: ${err.message}`);
		return next(err);
	}
});

router.post("/users/password-reset/confirm", authLimiter, async (req, res, next) => {
	try {
		const token = typeof req.body?.token === "string" ? req.body.token.trim() : "";
		const newPassword = typeof req.body?.newPassword === "string" ? req.body.newPassword : "";

		if (!PASSWORD_RESET_TOKEN_PATTERN.test(token)) {
			return res.status(422).json({ errors: { token: "is invalid" } });
		}

		if (!newPassword) {
			return res.status(422).json({ errors: { newPassword: "is required" } });
		}

		if (newPassword.trim().length < 8) {
			return res.status(422).json({ errors: { newPassword: "is invalid" } });
		}

		const user = await UserModel.findOne({
			passwordResetTokenHash: hashPasswordResetToken(token),
			passwordResetTokenExpiresAt: { $gt: new Date() },
		});

		if (!user || !user.validPasswordResetToken(token)) {
			return res.status(422).json({ errors: { token: "is invalid or expired" } });
		}

		user.setPassword(newPassword);
		await user.save();

		clearAuthCookies(res);
		return res.json({ success: true });
	} catch (err) {
		logger.error(`Password reset confirm error: ${err.message}`);
		return next(err);
	}
});

router.put(
	"/users/modify",
	modifyLimiter,
	auth.required,
	requireAuthContext("Token verification error in modify"),
	upload.fields([
		{ name: "banner", maxCount: 1 },
		{ name: "avatar", maxCount: 1 },
	]),
	async (req, res, next) => {
		const { decoded } = req.authContext;

		const session = await mongoose.startSession();
		try {
			await session.withTransaction(async () => {
				const user = await UserModel.findById(decoded.id).session(session).exec();
				if (!user) {
					const err = new Error("User not found");
					err.status = 404;
					throw err;
				}

				const { displayName, bio, allowNSFW, allowAnyNotifications, allowPublicChatNotifications, allowPrivateChatNotifications } = req.body;
				if (displayName != null) user.displayName = displayName;
				if (bio != null) user.bio = bio;
				if (allowNSFW != null) user.allowNSFW = allowNSFW;
				if (allowAnyNotifications != null) user.allowAnyNotifications = allowAnyNotifications;
				if (allowPublicChatNotifications != null) user.allowPublicChatNotifications = allowPublicChatNotifications;
				if (allowPrivateChatNotifications != null) user.allowPrivateChatNotifications = allowPrivateChatNotifications;

				const bannerFile = req.files?.banner?.[0];
				const avatarFile = req.files?.avatar?.[0];

				user.bannerUrl = await processFileUpload(databaseServer.gridfsBucket, bannerFile, "banner", decoded.id, user.bannerUrl);

				user.avatarUrl = await processFileUpload(databaseServer.gridfsBucket, avatarFile, "avatar", decoded.id, user.avatarUrl);

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

router.put("/users/password", modifyLimiter, auth.required, requireAuthContext("Password change auth error"), async (req, res, next) => {
	try {
		const { user } = req.authContext;
		const currentPassword = req.body?.currentPassword;
		const newPassword = req.body?.newPassword;

		if (!currentPassword) {
			return res.status(422).json({ errors: { currentPassword: "is required" } });
		}

		if (!newPassword) {
			return res.status(422).json({ errors: { newPassword: "is required" } });
		}

		if (String(newPassword).trim().length < 8) {
			return res.status(422).json({ errors: { newPassword: "is invalid" } });
		}

		if (!user.validPassword(currentPassword)) {
			return res.status(403).json({ errors: { currentPassword: "is incorrect" } });
		}

		user.setPassword(newPassword);
		await user.save();

		clearAuthCookies(res);
		return res.json({ success: true });
	} catch (err) {
		logger.error(`Password change error: ${err.message}`);
		return next(err);
	}
});

router.delete("/users/sessions", modifyLimiter, auth.required, requireAuthContext("Session bulk revoke auth error"), async (req, res, next) => {
	try {
		const { user } = req.authContext;
		const scope = req.query.scope;
		const currentTokenHash = resolveCurrentRefreshTokenHash(req, user);

		user.pruneExpiredRefreshTokens();

		if (scope === "others" && currentTokenHash) {
			user.refreshTokens = user.refreshTokens.filter((token) => token.tokenHash === currentTokenHash);
		} else if (scope === "current" && currentTokenHash) {
			user.refreshTokens = user.refreshTokens.filter((token) => token.tokenHash !== currentTokenHash);
			clearAuthCookies(res);
		} else if (scope === "current") {
			clearAuthCookies(res);
		} else {
			user.refreshTokens = [];
			clearAuthCookies(res);
		}

		await user.save();
		return res.sendStatus(204);
	} catch (err) {
		logger.error(`Session bulk revoke error: ${err.message}`);
		return next(err);
	}
});

router.delete("/users/sessions/:sessionId", modifyLimiter, auth.required, requireAuthContext("Session revoke auth error"), async (req, res, next) => {
	try {
		const { user } = req.authContext;
		const { sessionId } = req.params;
		const currentTokenHash = resolveCurrentRefreshTokenHash(req, user);

		user.pruneExpiredRefreshTokens();

		const targetIndex = user.refreshTokens.findIndex((token) => token._id?.toString?.() === sessionId || token.tokenHash === sessionId);

		if (targetIndex === -1) {
			return res.status(404).json({ error: "Session not found" });
		}

		const [removed] = user.refreshTokens.splice(targetIndex, 1);

		if (currentTokenHash && removed?.tokenHash === currentTokenHash) {
			clearAuthCookies(res);
		}

		await user.save();
		return res.sendStatus(204);
	} catch (err) {
		logger.error(`Session revoke error: ${err.message}`);
		return next(err);
	}
});

router.put(
	"/users/addfriend",
	generalLimiter,
	auth.required,
	requireAuthContext("Token verification error in addfriend"),
	friendAction("Add friend", async (req, res) => {
		const { decoded, user: sender } = req.authContext;

		if (decoded.id === req.body.recipientId) {
			return res.sendStatus(403);
		}

		const recipient = await validateUserById(req.body.recipientId);
		const result = await sendFriendRequest(sender, recipient);
		return res.json(result);
	})
);

router.put(
	"/users/acceptfriend",
	generalLimiter,
	auth.required,
	requireAuthContext("Token verification error in acceptfriend"),
	friendAction("Accept friend", async (req, res) => {
		const friend = await validateFriendById(req.body.friendId);
		if (friend.confirmed) {
			return res.sendStatus(403);
		}
		if (friend.recipient.toString() !== req.authContext.decoded.id) {
			return res.sendStatus(401);
		}
		friend.confirmed = true;
		await friend.save();

		return res.sendStatus(200);
	})
);

router.put(
	"/users/declinefriend",
	generalLimiter,
	auth.required,
	requireAuthContext("Token verification error in declinefriend"),
	friendAction("Decline friend", async (req, res) => {
		await declineFriend(req.body.friendId, req.authContext.decoded.id);
		return res.sendStatus(200);
	})
);

router.put(
	"/users/cancelfriend",
	generalLimiter,
	auth.required,
	requireAuthContext("Token verification error in cancelfriend"),
	friendAction("Cancel friend", async (req, res) => {
		await cancelFriend(req.body.friendId, req.authContext.decoded.id);
		return res.sendStatus(200);
	})
);

router.put(
	"/users/removefriend",
	generalLimiter,
	auth.required,
	requireAuthContext("Token verification error in removefriend"),
	friendAction("Remove friend", async (req, res) => {
		await removeFriend(req.body.friendId, req.authContext.decoded.id);
		return res.sendStatus(200);
	})
);

export { normalizeRedirectTarget, resolveClientRedirectTarget, withAuthErrorParam, withAuthSuccessParam };
export default router;
