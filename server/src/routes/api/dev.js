import { Router } from "express";
import { auth, getTokenFromHeader } from "../auth.js";
import UserModel from "../../models/User.js";
import FriendModel from "../../models/Friend.js";
import RoomModel from "../../models/Room.js";
import passport from "passport";
import jwt from "jsonwebtoken";
import logger from "../../logger.js";
import "dotenv/config";

const router = Router();

router.put("/dev/database/wipe", async function (req, res, next) {
  if (process.env.NODE_ENV !== "development") {
    return res.sendStatus(403);
  }

  await FriendModel.deleteMany({});
  await UserModel.deleteMany({});
  await RoomModel.deleteMany({});

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
