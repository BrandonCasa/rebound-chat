import mongoose, { Schema } from "mongoose";

const ServerSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, "is required"] },
    owner: { type: Schema.Types.ObjectId, ref: "User", required: [true, "is required"] },
    tags: [{ type: Schema.Types.ObjectId, ref: "RoomTag", required: [true, "is required"] }],
    settings: [{ type: Schema.Types.ObjectId, ref: "ServerSetting" }],
    groups: [{ type: Schema.Types.ObjectId, ref: "RoomGroup" }],
    events: [{ type: Schema.Types.ObjectId, ref: "ServerEvent" }],
    followers: [{ type: Schema.Types.ObjectId, ref: "User" }],
    banned: [{ type: Schema.Types.ObjectId, ref: "User" }],
    invites: [{ type: Schema.Types.ObjectId, ref: "User" }],
  },
  { timestamps: true }
);

const ServerModel = mongoose.model("Server", ServerSchema);

export default ServerModel;
