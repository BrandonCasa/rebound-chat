import mongoose, { Schema } from "mongoose";
import mongooseUniqueValidator from "mongoose-unique-validator";
import crypto from "crypto";
import jwt from "jsonwebtoken";
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

	// Populate fields for private data using the provided session if available.
	await this.populate({ path: "friends", options: { session } });
	await this.populate({ path: "serverInvites", options: { session } });

	return {
		id: this._id,
		username: this.username,
		email: this.email,
		displayName: this.displayName,
		bio: this.bio,
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
	// If no querying user is provided, return only basic public profile information.
	if (!queryingUser) {
		return {
			id: this._id,
			username: this.username,
			displayName: this.displayName,
			bio: this.bio,
			friends: [],
			blocked: [],
			servers: [],
		};
	}

	// Populate the current user's friend relationships using session if provided.
	await this.populate({ path: "friends", options: { session } });
	const outFriends = this.friends;

	// 1. Look for any friend invite between this user and the querying user.
	const friendInvite = outFriends.find((f) => f.requester.toString() === queryingUser._id.toString() || f.recipient.toString() === queryingUser._id.toString());

	// 2. Calculate my confirmed friends (only the confirmed ones).
	// Determine "the other person" in each confirmed friend relationship.
	const myConfirmedFriends = outFriends
		.filter((f) => f.confirmed)
		.map((f) => (f.requester.toString() === this._id.toString() ? f.recipient.toString() : f.requester.toString()));

	// 3. Ensure the querying user's friend list is populated and calculate their confirmed friends.
	const queryingUserData = await this.model("User").findById(queryingUser._id).populate({ path: "friends", options: { session } });
	const queryingConfirmedFriends = queryingUserData.friends
		.filter((f) => f.confirmed)
		.map((f) => (f.requester.toString() === queryingUserData._id.toString() ? f.recipient.toString() : f.requester.toString()));

	// 4. Mutual friend IDs are the intersection of the two confirmed friends lists.
	const mutualFriendIds = myConfirmedFriends.filter((id) => queryingConfirmedFriends.includes(id));

	// 5. Determine if the querying user is blocked.
	const isBlocked = this.blocked.some((b) => b.toString() === queryingUser._id.toString());
	const blockedList = isBlocked ? [queryingUser] : [];

	// 6. Calculate mutual servers between both users.
	const queryingUserServers = queryingUser.servers ? queryingUser.servers.map((s) => s.toString()) : [];
	const mutualServers = this.servers.filter((serverId) => queryingUserServers.includes(serverId.toString()));

	// Return the public profile JSON with separate keys for mutualFriends and friendInvite.
	return {
		id: this._id,
		username: this.username,
		displayName: this.displayName,
		bio: this.bio,
		friends: [friendInvite, ...mutualFriendIds].filter(function (friendEl) {
			return friendEl != null;
		}),
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
	const session = await this.startSession();
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

// Post-save hook: Notify server watchers when a user is saved.
UserSchema.post("save", async function (doc) {
	// Use the same user document as the querying/requesting user
	const publicInfo = await doc.toProfilePubJSON(doc);
	const privateInfo = await doc.toProfilePrivJSON(doc);

	serverWatchers.onUserSaved(doc._id.toString(), publicInfo, privateInfo);
});

const UserModel = mongoose.model("User", UserSchema);
export default UserModel;
