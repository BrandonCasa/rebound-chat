import mongoose, { Schema } from "mongoose";

const ServerInviteSchema = new mongoose.Schema(
  {
    server: { type: Schema.Types.ObjectId, ref: "Server", required: [true, "is required"] },
    requester: { type: Schema.Types.ObjectId, ref: "User", required: [true, "is required"] },
    recipient: { type: Schema.Types.ObjectId, ref: "User", required: [true, "is required"] },
  },
  { timestamps: true }
);

const ServerInviteModel = mongoose.model("ServerInvite", ServerInviteSchema);

export default ServerInviteModel;
