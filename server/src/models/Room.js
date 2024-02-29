import mongoose, { Schema } from "mongoose";

const RoomSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, "is required"] },
    description: { type: String, default: "" },
    group: { type: Schema.Types.ObjectId, ref: "RoomGroup" },
    settings: [{ type: Schema.Types.ObjectId, ref: "Setting" }],
    messages: [{ type: Schema.Types.ObjectId, ref: "Message" }],
  },
  { timestamps: true }
);

const RoomModel = mongoose.model("Room", RoomSchema);

export default RoomModel;
