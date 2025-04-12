import mongoose, { Schema } from "mongoose";
import mongooseUniqueValidator from "mongoose-unique-validator";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import serverWatchers from "../socketio/watchers.js";

const UserSchema = new Schema(
	{
		username: { type: String, lowercase: true, unique: true, required: [true, "is required"], match: [/^[a-zA-Z0-9]+$/, "is invalid"], index: true },
		email: { type: String, lowercase: true, unique: true, required: [true, "is required"], match: [/\S+@\S+\.\S+/, "is invalid"], index: true },
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

UserSchema.methods.deactivate = function () {
	this.active = false;
	return;
};

UserSchema.methods.validPassword = function (password) {
	var hash = crypto.pbkdf2Sync(password, this.salt, 10000, 512, "sha512").toString("hex");
	return this.hash === hash;
};

UserSchema.methods.setPassword = function (password) {
	this.salt = crypto.randomBytes(16).toString("hex");
	this.hash = crypto.pbkdf2Sync(password, this.salt, 10000, 512, "sha512").toString("hex");
	return;
};

UserSchema.methods.generateJWT = function () {
	var today = new Date();
	var exp = new Date(today);
	exp.setDate(today.getDate() + 60); // expire after 60 days

	return jwt.sign(
		{
			id: this._id,
			username: this.username,
			exp: parseInt(exp.getTime() / 1000),
		},
		process.env.SECRET
	);
};

UserSchema.methods.toAuthJSON = function () {
	return {
		username: this.username,
		email: this.email,
		displayName: this.displayName,
		token: this.generateJWT(),
		bio: this.bio,
		id: this._id,
		friends: this.friends,
		blocked: this.blocked,
		serverInvites: this.serverInvites,
	};
};

UserSchema.methods.toProfilePrivJSON = async function (requestingUser) {
	if (requestingUser._id !== this._id) return;

	const outFriends = (await this.populate("friends")).friends;
	const outInvites = (await this.populate("serverInvites")).serverInvites;

	return {
		username: this.username,
		email: this.email,
		displayName: this.displayName,
		bio: this.bio,
		id: this._id,
		friends: outFriends,
		blocked: this.blocked,
		serverInvites: outInvites,
		servers: this.servers,
	};
};

UserSchema.methods.toProfilePubJSON = async function (methodQueryingUser) {
	// Populate the user’s friends and serverInvites.
	await this.populate("friends");
	const outFriends = this.friends;

	// -------------------------------
	// 1. Friend Invite Between Users
	// -------------------------------
	// Find the friend record (invite or established friendship) that involves the querying user.
	let friendInvite = outFriends.find(
		(f) => f.requester.toString() === methodQueryingUser._id.toString() || f.recipient.toString() === methodQueryingUser._id.toString()
	);

	// -------------------------------
	// 2. Mutual Friends Calculation
	// -------------------------------
	// We only consider confirmed friendships.
	const myConfirmedFriends = outFriends
		.filter((f) => f.confirmed)
		.map((f) => (f.requester.toString() === this._id.toString() ? f.recipient.toString() : f.requester.toString()));

	// Ensure the querying user’s friends are populated.
	const queryingUser = await this.model("User").findById(methodQueryingUser._id).populate("friends");
	const queryingConfirmedFriends = queryingUser.friends
		.filter((f) => f.confirmed)
		.map((f) => (f.requester.toString() === queryingUser._id.toString() ? f.recipient.toString() : f.requester.toString()));

	// Find mutual friend IDs (intersection of the two lists).
	const mutualFriendIds = myConfirmedFriends.filter((id) => queryingConfirmedFriends.includes(id));

	// -------------------------------
	// 3. Blocked Users
	// -------------------------------
	// Only include the blocked array if the querying user is in it.
	const blockedList = this.blocked.some((b) => b.toString() === methodQueryingUser._id.toString()) ? [methodQueryingUser] : [];

	// -------------------------------
	// 4. Mutual Servers
	// -------------------------------
	// Here we assume that both this user and the querying user have an array
	// of server ids stored in the 'servers' field.
	// We take the intersection (making sure to compare as strings).
	const mutualServers = this.servers.filter((serverId) => methodQueryingUser.servers.map((s) => s.toString()).includes(serverId.toString()));

	// -------------------------------
	// 5. Final Public Profile JSON
	// -------------------------------
	return {
		username: this.username,
		displayName: this.displayName,
		bio: this.bio,
		id: this._id,
		// Returns the friend record between the two users (or undefined if none exists)
		friendInvite: friendInvite,
		// Mutual friends represented as an array of user IDs. You might instead choose to populate details.
		mutualFriends: mutualFriendIds,
		// Only returns blocked information if the querying user is blocked; otherwise, an empty array.
		blocked: blockedList,
		// Mutual servers shared between the profile user and the querying user.
		servers: mutualServers,
	};
};

UserSchema.methods.isBlocked = function (user) {
	return this.blocked.includes(user._id);
};

UserSchema.post("save", async function (doc) {
	const publicInfo = await doc.toProfilePubJSON();
	const privateInfo = await doc.toProfilePrivJSON();

	serverWatchers.onUserSaved(doc._id.toString(), publicInfo, privateInfo);
	return;
});

const UserModel = mongoose.model("User", UserSchema);

export default UserModel;
