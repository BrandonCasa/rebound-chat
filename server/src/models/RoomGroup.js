import mongoose, { Schema } from "mongoose";

const RoomGroupSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, "is required"] },
    rooms: [{ type: Schema.Types.ObjectId, ref: "Room" }],
    settings: [{ type: Schema.Types.ObjectId, ref: "Setting" }],
  },
  { timestamps: true }
);

const RoomGroupModel = mongoose.model("RoomGroup", RoomGroupSchema);

export default RoomGroupModel;
