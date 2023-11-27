import mongoose, { Schema } from "mongoose";

const FriendSchema = new mongoose.Schema(
  {
    requester: { type: Schema.Types.ObjectId, ref: "User" },
    recipient: { type: Schema.Types.ObjectId, ref: "User" },
    confirmed: { type: Boolean, default: false },
  },
  { timestamps: true }
);

FriendSchema.methods.acceptRequest = function (callerId) {
  console.log(this.requester);

  return this.save();
};

const FriendModel = mongoose.model("Friend", FriendSchema);

export default FriendModel;
