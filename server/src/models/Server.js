import mongoose, { Schema } from "mongoose";

const ServerSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, "is required"] },
    owner: { type: Schema.Types.ObjectId, ref: "User", required: [true, "is required"] },
    tags: [{ type: String }],
    settings: [{ type: Schema.Types.ObjectId, ref: "Setting" }],
    groups: [{ type: Schema.Types.ObjectId, ref: "RoomGroup" }],
    events: [{ type: Schema.Types.ObjectId, ref: "ServerEvent" }],
    followers: [{ type: Schema.Types.ObjectId, ref: "User" }],
    banned: [{ type: Schema.Types.ObjectId, ref: "User" }],
    invites: [{ type: Schema.Types.ObjectId, ref: "ServerInvite" }],
  },
  { timestamps: true }
);

const ServerModel = mongoose.model("Server", ServerSchema);

export default ServerModel;
