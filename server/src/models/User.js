import mongoose from "mongoose";
import mongooseUniqueValidator from "mongoose-unique-validator";

const UserSchema = new mongoose.Schema(
  {
    loginName: { type: String, lowercase: true, unique: true, required: [true, "is required."], match: [/^[a-zA-Z0-9]+$/, "is invalid."], index: true },
    email: { type: String, lowercase: true, unique: true, required: [true, "is required."], match: [/\S+@\S+\.\S+/, "is invalid."], index: true },
    displayName: String,
    bio: String,
    hash: String,
    salt: String,
  },
  { timestamps: true }
);

UserSchema.plugin(mongooseUniqueValidator, { message: "is already taken." });

const UserModel = mongoose.model("User", UserSchema);

export default UserModel;
