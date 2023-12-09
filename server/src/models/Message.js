import mongoose, { Schema } from "mongoose";

const MessageSchema = new mongoose.Schema(
  {
    sender: { type: Schema.Types.ObjectId, ref: "User", required: [true, "is required"] },
    content: { type: String, required: [true, "is required"] },
  },
  { timestamps: true }
);

const MessageModel = mongoose.model("Message", MessageSchema);

export default MessageModel;
