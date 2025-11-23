import crypto from "crypto";

import jwt from "jsonwebtoken";
import mongoose, { Schema } from "mongoose";
import mongooseUniqueValidator from "mongoose-unique-validator";

import serverWatchers from "../socketio/watchers.js";

const hashRefreshToken = (token) => crypto.createHash("sha256").update(token).digest("hex");
const normalizeFingerprintValue = (value) => {
        if (!value) return null;
        const trimmed = String(value).trim().toLowerCase();
        return trimmed || null;
};

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
                                userAgent: { type: String },
                                userAgentParsed: { type: String },
                                userAgentDeviceType: { type: String },
                                deviceName: { type: String },
                                ipAddress: { type: String },
                                location: { type: String },
                                lastUsed: { type: Date },
                        },
                ],
        },
        { timestamps: true }
);

UserSchema.plugin(mongooseUniqueValidator, { message: "is already taken" });

UserSchema.methods.deactivate = function () {
	this.active = false;
};

UserSchema.methods.pruneExpiredRefreshTokens = function () {
	const now = new Date();
	this.refreshTokens = this.refreshTokens.filter((t) => t.expiresAt && t.expiresAt > now);
};

UserSchema.methods.validPassword = function (password) {
	const hash = crypto.pbkdf2Sync(password, this.salt, 10000, 512, "sha512").toString("hex");
	return this.hash === hash;
};

UserSchema.methods.setPassword = function (password) {
	this.salt = crypto.randomBytes(16).toString("hex");
	this.hash = crypto.pbkdf2Sync(password, this.salt, 10000, 512, "sha512").toString("hex");
	this.passwordChangedAt = new Date();
	this.tokenVersion += 1;
	this.refreshTokens = [];
};

UserSchema.methods.generateAccessToken = function () {
	const payload = {
		id: this._id,
		username: this.username,
		tokenVersion: this.tokenVersion,
	};

	return jwt.sign(payload, process.env.ACCESS_TOKEN_SECRET, {
		expiresIn: "15m",
	});
};

UserSchema.methods.generateRefreshToken = async function (descriptor = {}, existingTokenHash = null) {
        const payload = {
                id: this._id,
                tokenVersion: this.tokenVersion,
        };

	const token = jwt.sign(payload, process.env.REFRESH_TOKEN_SECRET, {
		expiresIn: `${REFRESH_TOKEN_LIFETIME_DAYS}d`,
	});

        this.pruneExpiredRefreshTokens();

        const descriptorFingerprint = {
                userAgent: normalizeFingerprintValue(descriptor.userAgentParsed || descriptor.userAgent),
                device: normalizeFingerprintValue(descriptor.deviceName),
                ip: normalizeFingerprintValue(descriptor.ipAddress),
        };

        let targetIndex = existingTokenHash
                ? this.refreshTokens.findIndex((t) => t.tokenHash === existingTokenHash)
                : null;

        if (targetIndex === null || targetIndex < 0 || targetIndex >= this.refreshTokens.length) {
                targetIndex = this.refreshTokens.findIndex((t) => {
                        const tokenFingerprint = {
                                userAgent: normalizeFingerprintValue(t.userAgentParsed || t.userAgent),
                                device: normalizeFingerprintValue(t.deviceName),
                                ip: normalizeFingerprintValue(t.ipAddress),
                        };

                        return (
                                descriptorFingerprint.userAgent &&
                                descriptorFingerprint.device &&
                                tokenFingerprint.userAgent === descriptorFingerprint.userAgent &&
                                tokenFingerprint.device === descriptorFingerprint.device &&
                                (!descriptorFingerprint.ip || tokenFingerprint.ip === descriptorFingerprint.ip)
                        );
                });
        }

        const expiresAt = new Date(Date.now() + REFRESH_TOKEN_LIFETIME_DAYS * 24 * 60 * 60 * 1000);
        const lastUsed = new Date();

        const tokenHash = hashRefreshToken(token);
        const { userAgent, userAgentParsed, userAgentDeviceType, deviceName, ipAddress, location } = descriptor;
        const existingId =
                targetIndex != null && targetIndex >= 0 && targetIndex < this.refreshTokens.length
                        ? this.refreshTokens[targetIndex]._id
                        : null;

        const tokenRecord = {
                ...(existingId ? { _id: existingId } : {}),
                tokenHash,
                expiresAt,
                userAgent: userAgent || "Unknown",
                userAgentParsed: userAgentParsed || userAgent || "Unknown",
                userAgentDeviceType: userAgentDeviceType || "desktop",
                deviceName: deviceName || userAgentParsed || userAgent || "Unknown device",
                ipAddress: ipAddress || "Unknown",
                location: location || ipAddress || "Unknown",
                lastUsed,
        };

        if (targetIndex === null || targetIndex < 0 || targetIndex >= this.refreshTokens.length) {
                this.refreshTokens.push(tokenRecord);
        } else {
                this.refreshTokens[targetIndex] = tokenRecord;
        }
        await this.save();

        return token;
};

UserSchema.methods.revokeRefreshToken = async function (rawToken) {
	this.pruneExpiredRefreshTokens();

	const tokenHash = hashRefreshToken(rawToken);
	this.refreshTokens = this.refreshTokens.filter((t) => t.tokenHash !== tokenHash);
	await this.save();
};

UserSchema.methods.revokeAllRefreshTokens = async function () {
	this.refreshTokens = [];
	await this.save();
};

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

UserSchema.methods.toProfilePubJSON = async function (queryingUser, session = null) {
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

	const friendInvite = outFriends.find((f) => f.requester.toString() === queryingUser._id.toString() || f.recipient.toString() === queryingUser._id.toString());

	const myConfirmed = outFriends
		.filter((f) => f.confirmed)
		.map((f) => (f.requester.toString() === this._id.toString() ? f.recipient.toString() : f.requester.toString()));

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

UserSchema.methods.isBlocked = function (user) {
	return this.blocked.some((blockedId) => blockedId.toString() === user._id.toString());
};

UserSchema.statics.transaction = async function (callback) {
	const session = await mongoose.startSession();
	let result;
	try {
		await session.withTransaction(async () => {
			result = await callback(session);
		});
		return result;
	} finally {
		session.endSession();
	}
};

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
