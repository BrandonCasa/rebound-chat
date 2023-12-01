import { Router } from "express";
import { auth, getTokenFromHeader } from "../auth.js";
import UserModel from "../../models/User.js";
import FriendModel from "../../models/Friend.js";
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

  logger.info("Development Database Wiped.");

  return res.sendStatus(200);
});

export default router;
