import mongoose from "mongoose";

const UserSchema = new mongoose.Schema(
  {
    loginName: { type: String, lowercase: true, required: [true, "required"], match: [/^[a-zA-Z0-9]+$/, "invalid"], index: true },
    email: { type: String, lowercase: true, required: [true, "required"], match: [/\S+@\S+\.\S+/, "invalid"], index: true },
    displayName: String,
    bio: String,
    hash: String,
    salt: String,
  },
  { timestamps: true }
);

const UserModel = mongoose.model("User", UserSchema);

export default UserModel;
