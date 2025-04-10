import { Router } from "express";
import { auth, getTokenFromHeader } from "../auth.js";
import UserModel from "../../models/User.js";
import FriendModel from "../../models/Friend.js";
import RoomModel from "../../models/Room.js";
import MessageModel from "../../models/Message.js";
import passport from "passport";
import jwt from "jsonwebtoken";
import logger from "../../logger.js";
import "dotenv/config";

const router = Router();

router.post("/admin/users/delete", async function (req, res, next) {
	// delete the following:
	// 		- friend requests with the user
	//			 (also go to the other user and remove
	//			 the friend request from their friend list)
	//		- server invites with the user
	//			 (also go to the other user and remove
	//			 the server invite from their invite list)
	// 		- server owner status for all servers
	//		   they are members of if they are the owner,
	//			 and pass the ownership to next in command
	// update the following:
	//		- all their user info replaced with "deleted user" stuff

	logger.info(`User (${req.body.user}) Deleted Successfully.`);

	return res.sendStatus(200);
});

export default router;
