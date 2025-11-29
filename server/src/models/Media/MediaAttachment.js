import mongoose, { Schema } from "mongoose";

const MediaAttachmentSchema = new mongoose.Schema(
	{
		sender: {
			type: Schema.Types.ObjectId,
			ref: "User",
			required: [true, "is required"],
		},
		url: { type: String, required: true },
		contentType: { type: String, required: true },
		size: { type: Number, required: true },
		originalName: { type: String, required: true },
		perceptualHashCoarse: { type: String, required: true },
		perceptualHashDense: { type: String, required: true },
	},
	{ timestamps: true }
);

const MediaModel = mongoose.model("MediaAttachment", MediaAttachmentSchema);

export default MediaModel;
