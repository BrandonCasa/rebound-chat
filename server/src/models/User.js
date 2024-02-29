import mongoose, { Schema } from "mongoose";
import mongooseUniqueValidator from "mongoose-unique-validator";
import crypto from "crypto";
import jwt from "jsonwebtoken";

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
  },
  { timestamps: true }
);

UserSchema.plugin(mongooseUniqueValidator, { message: "is already taken" });

UserSchema.methods.validPassword = function (password) {
  var hash = crypto.pbkdf2Sync(password, this.salt, 10000, 512, "sha512").toString("hex");
  return this.hash === hash;
};

UserSchema.methods.setPassword = function (password) {
  this.salt = crypto.randomBytes(16).toString("hex");
  this.hash = crypto.pbkdf2Sync(password, this.salt, 10000, 512, "sha512").toString("hex");
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
  };
};

UserSchema.methods.toProfileJSON = function (user) {
  return {
    username: this.username,
    displayName: this.displayName,
    bio: this.bio,
    id: this._id,
    //friends: user ? user.isFriends(this._id) : false,
  };
};

UserSchema.methods.toProfilePubJSON = function () {
  return {
    username: this.username,
    displayName: this.displayName,
    bio: this.bio,
    id: this._id,
  };
};

UserSchema.methods.isBlocked = function (user) {
  return this.blocked.includes(user._id);
};

const UserModel = mongoose.model("User", UserSchema);

export default UserModel;
