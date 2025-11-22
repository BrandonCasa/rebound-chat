import crypto from "crypto";

import jwt from "jsonwebtoken";
import mongoose, { Schema } from "mongoose";
import mongooseUniqueValidator from "mongoose-unique-validator";

import serverWatchers from "../socketio/watchers.js";

const hashRefreshToken = (token) => crypto.createHash("sha256").update(token).digest("hex");

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

		// —— image fields ——
		bannerUrl: { type: String, default: "" },
		avatarUrl: { type: String, default: "" },

		displayName: { type: String, default: "" },
		bio: { type: String, default: "" },

		hash: { type: String, default: "" },
		salt: { type: String, default: "" },

		friends: [{ type: Schema.Types.ObjectId, ref: "Friend" }],
		blocked: [{ type: Schema.Types.ObjectId, ref: "User" }],
		serverInvites: [{ type: Schema.Types.ObjectId, ref: "ServerInvite" }],
		servers: [{ type: Schema.Types.ObjectId, ref: "Server" }],
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
 * Deactivate the user.
 */
UserSchema.methods.deactivate = function () {
	this.active = false;
};

/**
 * Remove expired refresh tokens from this user document.
 * Does NOT save by itself – callers must save if needed.
 */
UserSchema.methods.pruneExpiredRefreshTokens = function () {
	const now = new Date();
	this.refreshTokens = this.refreshTokens.filter((t) => t.expiresAt && t.expiresAt > now);
};

/**
 * Check if the provided password is valid.
 * @param {String} password
 * @returns {Boolean}
 */
UserSchema.methods.validPassword = function (password) {
	const hash = crypto.pbkdf2Sync(password, this.salt, 10000, 512, "sha512").toString("hex");
	return this.hash === hash;
};

/**
 * Set the password for the user.
 * @param {String} password
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
 * Generate a volatile, short lived access token for the user with JWT, not stored in DB.
 * @implements {tokenVersion: { type: Number}} Current token version
 * @returns {String} JWT
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
 * Generate a longer lived refresh token for the user with JWT, stored in DB and can be invalidated.
 * Also prunes old/expired tokens on each call.
 * @returns {String} JWT
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
 * Revoke a specific refresh token.
 * Also prunes expired tokens first.
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
 */
UserSchema.methods.revokeAllRefreshTokens = async function () {
	this.refreshTokens = [];
	await this.save();
};

/**
 * Return authentication JSON.
 * @returns {Object}
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
 * Return private profile information.
 * Only returns details if the requesting user is the owner.
 * @param {Object} requestingUser - The user requesting private details.
 * @param {Object} [session=null] - Optional mongoose session for transaction.
 * @returns {Object} Private profile data or an empty object.
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
 * Return public profile information.
 * Returns mutual confirmed friend IDs (if any) and any pending friend invite
 * as separate fields. Also calculates mutual servers and blocked status.
 * @param {Object|null} queryingUser - The user querying the profile (can be null).
 * @param {Object} [session=null] - Optional mongoose session for transaction.
 * @returns {Object} Public profile data.
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

	// find pending invite
	const friendInvite = outFriends.find((f) => f.requester.toString() === queryingUser._id.toString() || f.recipient.toString() === queryingUser._id.toString());

	// confirmed friends of this user
	const myConfirmed = outFriends
		.filter((f) => f.confirmed)
		.map((f) => (f.requester.toString() === this._id.toString() ? f.recipient.toString() : f.requester.toString()));

	// confirmed friends of querying user
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

	const mutualFriendIds = myConfirmed.filter((id) => theirConfirmed.includes(id));

	const isBlocked = this.blocked.some((b) => b.toString() === queryingUser._id.toString());
	const blockedList = isBlocked ? [queryingUser._id.toString()] : [];

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
 * Check if a given user is blocked.
 * @param {Object} user
 * @returns {Boolean}
 */
UserSchema.methods.isBlocked = function (user) {
	return this.blocked.some((blockedId) => blockedId.toString() === user._id.toString());
};

/**
 * Static helper to run a series of operations in a transaction.
 * Usage:
 * await UserModel.transaction(async (session) => {
 *    // perform operations with { session } option in queries / updates
 * });
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

// Post-save hook: Notify server watchers when a user is saved.
// Wrapped in try/catch so errors don't break the save flow.
UserSchema.post("save", function (doc) {
	try {
		serverWatchers.onUserSaved(doc._id.toString());
	} catch (err) {
		console.error("Error in onUserSaved hook:", err);
	}
});

const UserModel = mongoose.model("User", UserSchema);
export default UserModel;
