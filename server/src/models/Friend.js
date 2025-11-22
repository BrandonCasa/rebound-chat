import mongoose, { Schema } from "mongoose";

import serverWatchers from "../socketio/watchers.js";

import UserModel from "./User.js";

const FriendSchema = new mongoose.Schema(
	{
		requester: {
			type: Schema.Types.ObjectId,
			ref: "User",
			required: [true, "is required"],
		},
		recipient: {
			type: Schema.Types.ObjectId,
			ref: "User",
			required: [true, "is required"],
		},
		confirmed: { type: Boolean, default: false },
	},
	{ timestamps: true }
);

FriendSchema.post("save", async function (doc) {
	if (doc.confirmed) {
		await (await UserModel.findById(this.requester._id)).save();
		await (await UserModel.findById(this.recipient._id)).save();
	}
	//await (await UserModel.findById(this.requester._id)).save();
	//await (await UserModel.findById(this.recipient._id)).save();
	//await serverWatchers.onUserSaved(this.requester._id);
	//await serverWatchers.onUserSaved(this.recipient._id);
});

const FriendModel = mongoose.model("Friend", FriendSchema);

export default FriendModel;
