import crypto from "crypto";
import jwt from "jsonwebtoken";
import mongoose, { Schema, model, HydratedDocument, Model, Types, ClientSession } from "mongoose";
import mongooseUniqueValidator from "mongoose-unique-validator";
import serverWatchers from "../socketio/watchers.js";

// Document interface with instance methods
export interface IUser {
	username: string;
	email: string;
	googleId?: string;
	bannerUrl: string;
	avatarUrl: string;
	displayName: string;
	bio: string;
	hash: string;
	salt: string;
	friends: Types.ObjectId[];
	blocked: Types.ObjectId[];
	serverInvites: Types.ObjectId[];
	servers: Types.ObjectId[];
	active: boolean;
	createdAt: Date;
	updatedAt: Date;
}

export interface IUserMethods {
	deactivate(): Promise<this>;
	validPassword(password: string): boolean;
	setPassword(password: string): Promise<this>;
	generateJWT(): string;
	toAuthJSON(): Record<string, any>;
	toProfilePrivJSON(requestingUser: HydratedDocument<IUser, IUserMethods>, session?: ClientSession): Promise<Record<string, any>>;
	toProfilePubJSON(queryingUser?: HydratedDocument<IUser, IUserMethods>, session?: ClientSession): Promise<Record<string, any>>;
	isBlocked(user: HydratedDocument<IUser, IUserMethods>): boolean;
}

export type IUserDocument = HydratedDocument<IUser, IUserMethods>;

export interface IUserModel extends Model<IUser, {}, IUserMethods> {
	transaction<T>(callback: (session: ClientSession) => Promise<T>): Promise<T>;
}

const userSchema = new Schema<IUser, IUserModel, IUserMethods>(
	{
		username: { type: String, lowercase: true, unique: true, required: [true, "is required"], match: [/^[a-zA-Z0-9]+$/, "is invalid"], index: true },
		email: { type: String, lowercase: true, unique: true, required: [true, "is required"], match: [/\S+@\S+\.\S+/, "is invalid"], index: true },
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
	},
	{ timestamps: true }
);

userSchema.plugin(mongooseUniqueValidator, { message: "is already taken" });

userSchema.method("deactivate", async function (this: IUserDocument) {
	this.active = false;
	return this.save();
});

userSchema.method("validPassword", function (this: IUserDocument, password: string) {
	const hash = crypto.pbkdf2Sync(password, this.salt, 10000, 512, "sha512").toString("hex");
	return this.hash === hash;
});

userSchema.method("setPassword", async function (this: IUserDocument, password: string) {
	this.salt = crypto.randomBytes(16).toString("hex");
	this.hash = crypto.pbkdf2Sync(password, this.salt, 10000, 512, "sha512").toString("hex");
	return this.save();
});

userSchema.method("generateJWT", function (this: IUserDocument) {
	const today = new Date();
	const exp = new Date(today);
	exp.setDate(today.getDate() + 60);
	return jwt.sign({ id: this._id, username: this.username, exp: Math.floor(exp.getTime() / 1000) }, process.env.SECRET as string);
});

userSchema.method("toAuthJSON", function (this: IUserDocument) {
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
});

userSchema.method("toProfilePrivJSON", async function (this: IUserDocument, requestingUser: IUserDocument, session?: ClientSession) {
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
});

// Import the typed model so that findById returns a HydratedDocument
const User = model<IUser, IUserModel>("User", userSchema);

userSchema.method("toProfilePubJSON", async function (this: IUserDocument, queryingUser?: IUserDocument, session?: ClientSession) {
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
	const outFriends = this.friends as any[];

	const friendInvite = outFriends.find((f) => f.requester.toString() === queryingUser._id.toString() || f.recipient.toString() === queryingUser._id.toString());

	const myConfirmed = outFriends
		.filter((f) => f.confirmed)
		.map((f) => (f.requester.toString() === this._id.toString() ? f.recipient.toString() : f.requester.toString()));

	// Use User.findById so TS knows friends is on the returned document
	const queryingData = await User.findById(queryingUser._id).populate({ path: "friends", options: { session } });
	const theirConfirmed = (queryingData!.friends as any[])
		.filter((f) => f.confirmed)
		.map((f) => (f.requester.toString() === queryingData!._id.toString() ? f.recipient.toString() : f.requester.toString()));

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
});

userSchema.method("isBlocked", function (this: IUserDocument, user: IUserDocument) {
	return this.blocked.some((b) => b.toString() === user._id.toString());
});

userSchema.static("transaction", async function <T>(this: Model<IUser, {}, IUserMethods>, callback: (session: ClientSession) => Promise<T>) {
	const session = await mongoose.startSession();
	let result: T;
	try {
		await session.withTransaction(async () => {
			result = await callback(session);
		});
		return result!;
	} finally {
		session.endSession();
	}
});

export { User };
export default User;
