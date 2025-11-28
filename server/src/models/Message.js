import mongoose, { Schema } from "mongoose";

const AttachmentSchema = new Schema(
	{
		url: { type: String, required: true },
		contentType: { type: String, required: true },
		size: { type: Number, required: true },
		originalName: { type: String, required: true },
	},
	{ _id: false }
);

const MessageSchema = new mongoose.Schema(
	{
		sender: {
			type: Schema.Types.ObjectId,
			ref: "User",
			required: [true, "is required"],
		},
		content: { type: String, default: "" },
		mentions: [
			{
				user: { type: Schema.Types.ObjectId, ref: "User", required: true },
				start: { type: Number, required: true },
				end: { type: Number, required: true },
			},
		],
		attachments: { type: [AttachmentSchema], default: [] },
	},
	{ timestamps: true }
);

const MessageModel = mongoose.model("Message", MessageSchema);

export default MessageModel;
