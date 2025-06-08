import { Router } from "express";

import logger from "../../logger.js";
import FriendModel from "../../models/Friend.js";
import MessageModel from "../../models/Message.js";
import RoomModel from "../../models/Room.js";
import UserModel from "../../models/User.js";
import "dotenv/config";

const router = Router();

router.put("/dev/database/wipe", async function (req, res, _next) {
	if (process.env.NODE_ENV !== "development") {
		return res.sendStatus(403);
	}

	await FriendModel.deleteMany({});
	await UserModel.deleteMany({});
	await RoomModel.deleteMany({});
	await MessageModel.deleteMany({});

	logger.info("Development Database Wiped.");

	return res.sendStatus(200);
});

router.post("/dev/database/testroom", async function (req, res, next) {
	if (process.env.NODE_ENV !== "development") {
		return res.sendStatus(403);
	}

	let testRoom = new RoomModel();
	testRoom.name = "Test Room";
	testRoom.description = "The testing chat room.";

	testRoom
		.save()
		.then(function () {
			logger.info("Test Room Created.");

			return res.status(200).json({ roomId: testRoom._id });
		})
		.catch((err) => {
			next(err);
			return res.sendStatus(500);
		});
});

export default router;
