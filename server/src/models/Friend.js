import mongoose, { Schema } from "mongoose";

const FriendSchema = new mongoose.Schema(
  {
    requester: { type: Schema.Types.ObjectId, ref: "User", required: [true, "is required"] },
    recipient: { type: Schema.Types.ObjectId, ref: "User", required: [true, "is required"] },
    confirmed: { type: Boolean, default: false },
  },
  { timestamps: true }
);

const FriendModel = mongoose.model("Friend", FriendSchema);

export default FriendModel;
