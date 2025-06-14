import mongoose, { Schema } from "mongoose";

const DmThreadSchema = new mongoose.Schema(
  {
    participants: [{ type: Schema.Types.ObjectId, ref: "User" }],
    messages: [{ type: Schema.Types.ObjectId, ref: "Message" }],
  },
  { timestamps: true }
);

export default mongoose.model("DmThread", DmThreadSchema);
