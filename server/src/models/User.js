import mongoose from "mongoose";
import mongooseUniqueValidator from "mongoose-unique-validator";
import crypto from "crypto";
import jwt from "jsonwebtoken";

const UserSchema = new mongoose.Schema(
  {
    username: { type: String, lowercase: true, unique: true, required: [true, "is required"], match: [/^[a-zA-Z0-9]+$/, "is invalid"], index: true },
    email: { type: String, lowercase: true, unique: true, required: [true, "is required"], match: [/\S+@\S+\.\S+/, "is invalid"], index: true },
    displayName: String,
    bio: String,
    hash: String,
    salt: String,
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
  exp.setDate(today.getDate() + 60);

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
  };
};

UserSchema.methods.toProfileJSONFor = function (user) {
  return {
    username: this.username,
    displayName: this.displayName,
    bio: this.bio,
  };
};

const UserModel = mongoose.model("User", UserSchema);

export default UserModel;
