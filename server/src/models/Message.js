import mongoose, { Schema } from "mongoose";

const MessageSchema = new mongoose.Schema(
	{
		sender: {
			type: Schema.Types.ObjectId,
			ref: "User",
			required: [true, "is required"],
		},
		content: { type: String, required: [true, "is required"] },
		mentions: [
			{
				user: { type: Schema.Types.ObjectId, ref: "User", required: true },
				start: { type: Number, required: true },
				end: { type: Number, required: true },
			},
		],
		room: {
			type: Schema.Types.ObjectId,
			ref: "Server",
			required: [true, "is required"],
		},
		attachments: [{ type: Schema.Types.ObjectId, ref: "MediaAttachment" }],
	},
	{ timestamps: true }
);

const MessageModel = mongoose.model("Message", MessageSchema);

export default MessageModel;
