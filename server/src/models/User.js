import crypto from "crypto";

import jwt from "jsonwebtoken";
import mongoose, { Schema } from "mongoose";
import mongooseUniqueValidator from "mongoose-unique-validator";

import serverWatchers from "../socketio/watchers.js";

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

		// —— newly added image fields ——
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
};

/**
 * Generate a JSON Web Token for the user.
 * @returns {String} JWT
 */
UserSchema.methods.generateJWT = function () {
	const today = new Date();
	const exp = new Date(today);
	exp.setDate(today.getDate() + 60); // Expires in 60 days

	return jwt.sign(
		{
			id: this._id,
			username: this.username,
			exp: Math.floor(exp.getTime() / 1000),
		},
		process.env.SECRET
	);
};

/**
 * Return authentication JSON.
 * @returns {Object}
 */
UserSchema.methods.toAuthJSON = function () {
	return {
		id: this._id,
		username: this.username,
		email: this.email,
		displayName: this.displayName,
		bio: this.bio,
		bannerUrl: this.bannerUrl,
		avatarUrl: this.avatarUrl,
		token: this.generateJWT(),
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
	if (requestingUser._id.toString() !== this._id.toString()) return {};

	await this.populate({ path: "friends", options: { session } });
	await this.populate({ path: "serverInvites", options: { session } });

	return {
		id: this._id,
		username: this.username,
		email: this.email,
		displayName: this.displayName,
		bio: this.bio,
		bannerUrl: this.bannerUrl,
		avatarUrl: this.avatarUrl,
		friends: this.friends,
		blocked: this.blocked,
		serverInvites: this.serverInvites,
		servers: this.servers,
	};
};

/**
 * Return public profile information.
 * Returns mutual confirmed friend IDs (if any) and any pending friend invite as separate fields.
 * Also calculates mutual servers and blocked status.
 * @param {Object|null} queryingUser - The user querying the profile (can be null).
 * @param {Object} [session=null] - Optional mongoose session for transaction.
 * @returns {Object} Public profile data.
 */
UserSchema.methods.toProfilePubJSON = async function (queryingUser, session = null) {
	if (!queryingUser) {
		return {
			id: this._id,
			username: this.username,
			displayName: this.displayName,
			bio: this.bio,
			bannerUrl: this.bannerUrl,
			avatarUrl: this.avatarUrl,
			friends: [],
			blocked: [],
			servers: [],
		};
	}

	await this.populate({ path: "friends", options: { session } });
	const outFriends = this.friends;

	// find pending invite
	const friendInvite = outFriends.find((f) => f.requester.toString() === queryingUser._id.toString() || f.recipient.toString() === queryingUser._id.toString());

	// confirmed friends of this user
	const myConfirmed = outFriends
		.filter((f) => f.confirmed)
		.map((f) => (f.requester.toString() === this._id.toString() ? f.recipient.toString() : f.requester.toString()));

	// confirmed friends of querying user
	const queryingData = await this.model("User").findById(queryingUser._id).populate({ path: "friends", options: { session } });
	const theirConfirmed = queryingData.friends
		.filter((f) => f.confirmed)
		.map((f) => (f.requester.toString() === queryingData._id.toString() ? f.recipient.toString() : f.requester.toString()));

	const mutualFriendIds = myConfirmed.filter((id) => theirConfirmed.includes(id));

	const isBlocked = this.blocked.some((b) => b.toString() === queryingUser._id.toString());
	const blockedList = isBlocked ? [queryingUser._id.toString()] : [];

	const theirServers = queryingUser.servers.map((s) => s.toString());
	const mutualServers = this.servers.filter((s) => theirServers.includes(s.toString()));

	return {
		id: this._id,
		username: this.username,
		displayName: this.displayName,
		bio: this.bio,
		bannerUrl: this.bannerUrl,
		avatarUrl: this.avatarUrl,
		friends: [friendInvite, ...mutualFriendIds].filter((x) => x != null),
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
UserSchema.post("save", async function (doc) {
	serverWatchers.onUserSaved(doc._id.toString());
});

const UserModel = mongoose.model("User", UserSchema);
export default UserModel;
