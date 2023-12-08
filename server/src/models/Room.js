import mongoose, { Schema } from "mongoose";

const RoomSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, "is required"] },
    description: { type: String, default: "" },
    group: { type: Schema.Types.ObjectId, ref: "RoomGroup", required: [true, "is required"] },
    settings: [{ type: Schema.Types.ObjectId, ref: "RoomSetting" }],
    messages: [{ type: Schema.Types.ObjectId, ref: "RoomMessage" }],
  },
  { timestamps: true }
);

RoomSchema.methods.addMessage = function (message) {
  console.log(this.messages);
  console.log(message);

  return this.save();
};

const RoomModel = mongoose.model("Room", RoomSchema);

export default RoomModel;
