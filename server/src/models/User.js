import crypto from "crypto";

import jwt from "jsonwebtoken";
import mongoose, { Schema } from "mongoose";
import mongooseUniqueValidator from "mongoose-unique-validator";

import serverWatchers from "../socketio/watchers.js";

/**
 * Hash a raw refresh token using SHA-256.
 * Only the hash is stored in the database for security.
 * @param {string} token - Raw JWT refresh token string.
 * @returns {string} Hex-encoded SHA-256 hash of the token.
 */
const hashRefreshToken = (token) => crypto.createHash("sha256").update(token).digest("hex");

/**
 * Number of days a refresh token remains valid.
 * Used both for JWT expiry and our own DB `expiresAt` field.
 */
const REFRESH_TOKEN_LIFETIME_DAYS = 60;

const UserSchema = new Schema(
	{
		username: {
			type: String,
			lowercase: true,
			unique: true,
			required: [true, "is required"],
			match: [/^[a-zA-Z0-9]+$/, "is invalid"],
			index: true,
		},
		email: {
			type: String,
			lowercase: true,
			unique: true,
			required: [true, "is required"],
			match: [/\S+@\S+\.\S+/, "is invalid"],
			index: true,
		},
		googleId: { type: String, unique: true, sparse: true },

		// Profile / branding fields
		bannerUrl: { type: String, default: "" },
		avatarUrl: { type: String, default: "" },

		displayName: { type: String, default: "" },
		bio: { type: String, default: "" },

		// Local auth credentials (pbkdf2 + salt)
		hash: { type: String, default: "" },
		salt: { type: String, default: "" },

		// Relationship / membership references
		friends: [{ type: Schema.Types.ObjectId, ref: "Friend" }],
		blocked: [{ type: Schema.Types.ObjectId, ref: "User" }],
		serverInvites: [{ type: Schema.Types.ObjectId, ref: "ServerInvite" }],
		servers: [{ type: Schema.Types.ObjectId, ref: "Server" }],

		// Account state & token management
		active: { type: Boolean, default: true },
		tokenVersion: {
			type: Number,
			default: 0,
		},
		passwordChangedAt: {
			type: Date,
		},
		refreshTokens: [
			{
				tokenHash: { type: String, required: true },
				expiresAt: { type: Date, required: true },
			},
		],
	},
	{ timestamps: true }
);

UserSchema.plugin(mongooseUniqueValidator, { message: "is already taken" });

/**
 * Mark the user as inactive.
 * NOTE: This does NOT automatically save the document, callers must `await user.save()`.
 */
UserSchema.methods.deactivate = function () {
	this.active = false;
};

/**
 * Remove expired refresh tokens from the in-memory document.
 * This does NOT call `save()`; callers must persist if they want the cleanup stored.
 */
UserSchema.methods.pruneExpiredRefreshTokens = function () {
	const now = new Date();
	this.refreshTokens = this.refreshTokens.filter((t) => t.expiresAt && t.expiresAt > now);
};

/**
 * Check if the provided password matches the stored password hash.
 * @param {string} password - Plain text password to validate.
 * @returns {boolean} True if the password is valid, false otherwise.
 */
UserSchema.methods.validPassword = function (password) {
	const hash = crypto.pbkdf2Sync(password, this.salt, 10000, 512, "sha512").toString("hex");
	return this.hash === hash;
};

/**
 * Set/update the user's password.
 * - Generates a new salt and hash.
 * - Updates `passwordChangedAt`.
 * - Increments `tokenVersion` to invalidate existing access tokens.
 * - Clears all stored refresh tokens.
 *
 * NOTE: This does NOT call `save()`. The caller is responsible for persisting the changes.
 * @param {string} password - New plain text password.
 */
UserSchema.methods.setPassword = function (password) {
	this.salt = crypto.randomBytes(16).toString("hex");
	this.hash = crypto.pbkdf2Sync(password, this.salt, 10000, 512, "sha512").toString("hex");
	this.passwordChangedAt = new Date();
	this.tokenVersion += 1;
	// Invalidate all existing refresh tokens when password changes.
	this.refreshTokens = [];
};

/**
 * Generate a short-lived access token (JWT) for the user.
 * This token is NOT persisted in the database.
 *
 * Payload includes:
 * - `id`: user ID
 * - `username`
 * - `tokenVersion`: used to invalidate tokens server-side
 *
 * @returns {string} Signed JWT access token.
 */
UserSchema.methods.generateAccessToken = function () {
	const payload = {
		id: this._id,
		username: this.username,
		tokenVersion: this.tokenVersion,
	};

	// Short-lived (e.g. 15 min)
	return jwt.sign(payload, process.env.ACCESS_TOKEN_SECRET, {
		expiresIn: "15m",
	});
};

/**
 * Generate a long-lived refresh token (JWT) for the user.
 *
 * Behavior:
 * - Uses `REFRESH_TOKEN_LIFETIME_DAYS` for JWT expiry.
 * - Prunes expired refresh tokens from `this.refreshTokens`.
 * - Hashes the new token and appends it to `refreshTokens` with `expiresAt`.
 * - Persists the user document (`await this.save()`).
 *
 * @returns {Promise<string>} The raw signed JWT refresh token.
 */
UserSchema.methods.generateRefreshToken = async function () {
	const payload = {
		id: this._id,
		tokenVersion: this.tokenVersion,
	};

	const token = jwt.sign(payload, process.env.REFRESH_TOKEN_SECRET, {
		expiresIn: `${REFRESH_TOKEN_LIFETIME_DAYS}d`,
	});

	// Remove any expired tokens before adding a new one.
	this.pruneExpiredRefreshTokens();

	const expiresAt = new Date(Date.now() + REFRESH_TOKEN_LIFETIME_DAYS * 24 * 60 * 60 * 1000);

	const tokenHash = hashRefreshToken(token);
	this.refreshTokens.push({ tokenHash, expiresAt });
	await this.save();

	return token;
};

/**
 * Revoke a specific refresh token for this user.
 *
 * Behavior:
 * - Prunes already-expired tokens from `refreshTokens`.
 * - Removes the token whose hash matches the given raw token.
 * - Persists the user document.
 *
 * @param {string} rawToken - The raw refresh JWT token to revoke.
 * @returns {Promise<void>}
 */
UserSchema.methods.revokeRefreshToken = async function (rawToken) {
	// Prune already-expired tokens
	this.pruneExpiredRefreshTokens();

	const tokenHash = hashRefreshToken(rawToken);
	this.refreshTokens = this.refreshTokens.filter((t) => t.tokenHash !== tokenHash);
	await this.save();
};

/**
 * Revoke all refresh tokens for the user.
 * Effectively logs the user out from all devices/sessions.
 *
 * @returns {Promise<void>}
 */
UserSchema.methods.revokeAllRefreshTokens = async function () {
	this.refreshTokens = [];
	await this.save();
};

/**
 * Build a JSON representation for authentication responses (e.g. login / register).
 *
 * Includes:
 * - user identity and profile fields
 * - the provided access token
 * - relationship-related references (friends, blocked, serverInvites)
 *
 * @param {string} accessToken - A pre-generated access token (JWT).
 * @returns {Object} Auth payload suitable for sending to clients.
 */
UserSchema.methods.toAuthJSON = function (accessToken) {
	return {
		id: this._id,
		username: this.username,
		email: this.email,
		displayName: this.displayName,
		bio: this.bio,
		bannerUrl: this.bannerUrl,
		avatarUrl: this.avatarUrl,
		createdAt: this.createdAt,
		token: accessToken,
		friends: this.friends,
		blocked: this.blocked,
		serverInvites: this.serverInvites,
	};
};

/**
 * Return private profile information for the owner of the account.
 *
 * Behavior:
 * - Only returns data if `requestingUser._id` matches this user's `_id`.
 * - Populates `friends` and `serverInvites` (optionally using the provided session).
 * - Includes sensitive fields like email and full server membership.
 *
 * @param {Object} requestingUser - The user requesting private details (must be the same user).
 * @param {import("mongoose").ClientSession|null} [session=null] - Optional Mongoose session for transactional reads.
 * @returns {Promise<Object>} Private profile data, or an empty object if unauthorized.
 */
UserSchema.methods.toProfilePrivJSON = async function (requestingUser, session = null) {
	if (!requestingUser || requestingUser._id.toString() !== this._id.toString()) return {};

	const populateOptions = session ? { session } : undefined;

	await this.populate({
		path: "friends",
		options: populateOptions ? { session: populateOptions.session } : {},
	});
	await this.populate({
		path: "serverInvites",
		options: populateOptions ? { session: populateOptions.session } : {},
	});

	return {
		id: this._id,
		username: this.username,
		email: this.email,
		displayName: this.displayName,
		bio: this.bio,
		bannerUrl: this.bannerUrl,
		avatarUrl: this.avatarUrl,
		createdAt: this.createdAt,
		friends: this.friends,
		blocked: this.blocked,
		serverInvites: this.serverInvites,
		servers: this.servers,
	};
};

/**
 * Return public profile information as visible to another user (or anonymously).
 *
 * If `queryingUser` is null:
 * - Returns basic public profile data only (no relationship data).
 *
 * If `queryingUser` is provided:
 * - Populates this user's `friends`.
 * - Computes:
 *   - `mutualFriends`: array of user IDs that are confirmed friends of both users.
 *   - `pendingFriendInvite`: Friend doc representing a pending invite between the two users, or null.
 *   - `blocked`: list containing `queryingUser._id` if they are blocked by this user, otherwise [].
 *   - `servers`: list of mutual server IDs the two users share.
 *
 * @param {Object|null} queryingUser - The user querying the profile (can be null/anonymous).
 * @param {import("mongoose").ClientSession|null} [session=null] - Optional Mongoose session for transactional reads.
 * @returns {Promise<Object>} Public profile data with relationship context.
 */
UserSchema.methods.toProfilePubJSON = async function (queryingUser, session = null) {
	// No querying user -> purely public information, no relationship data
	if (!queryingUser) {
		return {
			id: this._id,
			username: this.username,
			displayName: this.displayName,
			bio: this.bio,
			bannerUrl: this.bannerUrl,
			avatarUrl: this.avatarUrl,
			createdAt: this.createdAt,
			mutualFriends: [],
			pendingFriendInvite: null,
			blocked: [],
			servers: [],
		};
	}

	const populateOptions = session ? { session } : undefined;

	await this.populate({
		path: "friends",
		options: populateOptions ? { session: populateOptions.session } : {},
	});
	const outFriends = this.friends;

	// Pending friend invite between this user and the querying user (in either direction).
	const friendInvite = outFriends.find((f) => f.requester.toString() === queryingUser._id.toString() || f.recipient.toString() === queryingUser._id.toString());

	// Confirmed friends of this user (list of user IDs).
	const myConfirmed = outFriends
		.filter((f) => f.confirmed)
		.map((f) => (f.requester.toString() === this._id.toString() ? f.recipient.toString() : f.requester.toString()));

	// Confirmed friends of the querying user.
	const queryingData = await this.model("User")
		.findById(queryingUser._id)
		.populate({
			path: "friends",
			options: populateOptions ? { session: populateOptions.session } : {},
		});

	let theirConfirmed = [];
	if (queryingData && Array.isArray(queryingData.friends)) {
		theirConfirmed = queryingData.friends
			.filter((f) => f.confirmed)
			.map((f) => (f.requester.toString() === queryingData._id.toString() ? f.recipient.toString() : f.requester.toString()));
	}

	// Mutual friends = intersection of confirmed friend IDs.
	const mutualFriendIds = myConfirmed.filter((id) => theirConfirmed.includes(id));

	// Whether this user has blocked the querying user.
	const isBlocked = this.blocked.some((b) => b.toString() === queryingUser._id.toString());
	const blockedList = isBlocked ? [queryingUser._id.toString()] : [];

	// Mutual servers between this user and the querying user.
	const theirServers = (queryingUser.servers || []).map((s) => s.toString());
	const mutualServers = this.servers.filter((s) => theirServers.includes(s.toString()));

	return {
		id: this._id,
		username: this.username,
		displayName: this.displayName,
		bio: this.bio,
		bannerUrl: this.bannerUrl,
		avatarUrl: this.avatarUrl,
		createdAt: this.createdAt,
		mutualFriends: mutualFriendIds,
		pendingFriendInvite: friendInvite || null,
		blocked: blockedList,
		servers: mutualServers,
	};
};

/**
 * Check if a given user is blocked by this user.
 *
 * @param {Object} user - User document to check.
 * @returns {boolean} True if `user` is in this user's blocked list.
 */
UserSchema.methods.isBlocked = function (user) {
	return this.blocked.some((blockedId) => blockedId.toString() === user._id.toString());
};

/**
 * Run a callback inside a Mongoose transaction.
 *
 * Usage:
 * ```js
 * await UserModel.transaction(async (session) => {
 *   await UserModel.updateOne({ _id }, { ... }, { session });
 *   // other operations with the same session...
 * });
 * ```
 *
 * The callback receives a `session` and should pass it to all Mongoose operations
 * that should be part of the transaction.
 *
 * @param {(session: import("mongoose").ClientSession) => Promise<any>} callback - Function that performs transactional work.
 * @returns {Promise<any>} Whatever the callback returns.
 */
UserSchema.statics.transaction = async function (callback) {
	// 1) start a session on mongoose
	const session = await mongoose.startSession();
	let result;
	try {
		// 2) wrap your work in a transaction
		await session.withTransaction(async () => {
			result = await callback(session);
		});
		return result;
	} finally {
		session.endSession();
	}
};

// Post-save hook: notify server watchers when a user is saved.
// Wrapped in try/catch so hook failures don't break the main save flow.
UserSchema.post("save", function (doc) {
	try {
		serverWatchers.onUserSaved(doc._id.toString());
	} catch (err) {
		console.error("Error in onUserSaved hook:", err);
	}
});

const UserModel = mongoose.model("User", UserSchema);
export { hashRefreshToken };
export default UserModel;
