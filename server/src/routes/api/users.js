import { Router } from "express";

import UserModel from "../../models/User.js";
import { auth, getTokenFromHeader } from "../auth.js";

import jwt from "jsonwebtoken";
import passport from "passport";

import logger from "../../logger.js";
import "dotenv/config";
import {
  sendFriendRequest,
  validateFriendById,
  validateUserById,
  removeFriend,
  declineFriend,
  cancelFriend,
} from "../../models/helpers/UserHelper.js";

const router = Router();

/**
 * /users/verify
 * Verify a user via token. Checks that the account is active and returns authentication data.
 */
router.post("/users/verify", async (req, res, next) => {
  const token = getTokenFromHeader(req);

  try {
    const decoded = jwt.verify(token, process.env.SECRET);
    const user = await UserModel.findById(decoded.id);
    if (!user || user.active === false) {
      return res.status(401).json({ error: "Invalid or deactivated account." });
    }
    return res.json({ user: user.toAuthJSON() });
  } catch (err) {
    logger.error(`Verification error: ${err.message}`);
    next(err);
    return res.sendStatus(500);
  }
});

/**
 * /users/profile
 * Retrieve a user's profile.
 * If a query parameter id is provided and does not match the requesting user,
 * returns the public profile (with mutual friend and server info).
 * Otherwise, returns the private profile.
 */
router.get("/users/profile", auth.required, async (req, res, next) => {
  const token = getTokenFromHeader(req);
  try {
    const decoded = jwt.verify(token, process.env.SECRET);
    // Use provided id if any, otherwise default to the logged-in user's id.
    const targetUserId = req.query.id || decoded.id;
    const user = await UserModel.findById(targetUserId);

    if (!user) {
      return res.sendStatus(404);
    }

    let profile;
    // If the request is for the owner's profile, return the private version.
    if (decoded.id === user._id.toString()) {
      profile = await user.toProfilePrivJSON(user);
    } else {
      // For public profile, fetch the querying user's document to calculate mutual fields.
      const queryingUser = await UserModel.findById(decoded.id);
      profile = await user.toProfilePubJSON(queryingUser);
    }

    return res.json({ user: profile });
  } catch (err) {
    logger.error(`Profile retrieval error: ${err.message}`);
    next(err);
    return res.sendStatus(500);
  }
});

/**
 * /users/login
 * Log in a user using passport local strategy.
 */
router.post("/users/login", (req, res, next) => {
  if (!req.body?.user?.email) {
    return res.status(422).json({ errors: { email: "is required" } });
  }
  if (!req.body?.user?.password) {
    return res.status(422).json({ errors: { password: "is required" } });
  }

  passport.authenticate("local", { session: false }, (err, user, info) => {
    if (err) {
      logger.error(`Login error: ${err.message}`);
      return next(err);
    }
    if (user) {
      return res.json({ user: user.toAuthJSON() });
    } else {
      return res.status(422).json(info);
    }
  })(req, res, next);
});

/**
 * /users/register
 * Register a new user. Checks for a password with a minimum length.
 */
router.post("/users/register", async (req, res, next) => {
  try {
    const { username, email, displayName, bio, password } = req.body.user;
    if (!password || password.trim().length < 8) {
      return res.status(422).json({ errors: { password: "is invalid" } });
    }
    const user = new UserModel({ username, email, displayName, bio });
    user.setPassword(password);

    await user.save();
    return res.json({ user: user.toAuthJSON() });
  } catch (err) {
    logger.error(`Registration error: ${err.message}`);
    next(err);
    return res.sendStatus(500);
  }
});

/**
 * /users/modify
 * Update fields of the user's profile.
 * This endpoint uses a transaction, which is important for replica sets.
 */
router.put("/users/modify", auth.required, async (req, res, next) => {
  const token = getTokenFromHeader(req);
  let decoded;
  try {
    decoded = jwt.verify(token, process.env.SECRET);
  } catch (err) {
    logger.error(`Token verification error in modify: ${err.message}`);
    return res.sendStatus(401);
  }

  try {
    await UserModel.transaction(async (session) => {
      const user = await UserModel.findById(decoded.id).session(session);
      if (!user) {
        res.sendStatus(404);
        return;
      }
      // Only update fields that are sent in the request.
      if (typeof req.body.user.username !== "undefined") {
        user.username = req.body.user.username;
      }
      if (typeof req.body.user.email !== "undefined") {
        user.email = req.body.user.email;
      }
      if (typeof req.body.user.displayName !== "undefined") {
        user.displayName = req.body.user.displayName;
      }
      if (typeof req.body.user.bio !== "undefined") {
        user.bio = req.body.user.bio;
      }
      if (typeof req.body.user.password !== "undefined") {
        user.setPassword(req.body.user.password);
      }
      await user.save({ session });
      res.json({ user: user.toAuthJSON() });
    });
  } catch (err) {
    logger.error(`User modification error: ${err.message}`);
    next(err);
    return res.sendStatus(500);
  }
});

/**
 * Friend-related endpoints
 */

/**
 * /users/addfriend
 * Send a friend request.
 * The sender is the authenticated user and the recipient is provided in the request body.
 */
router.put("/users/addfriend", auth.required, async (req, res, next) => {
  const token = getTokenFromHeader(req);
  let decoded;
  try {
    decoded = jwt.verify(token, process.env.SECRET);
  } catch (err) {
    logger.error(`Token verification error in addfriend: ${err.message}`);
    return res.sendStatus(401);
  }

  // Prevent a user from sending a friend request to themselves.
  if (decoded.id === req.body.recipientId) {
    return res.sendStatus(403);
  }

  try {
    const sender = await validateUserById(decoded.id);
    const recipient = await validateUserById(req.body.recipientId);
    const result = await sendFriendRequest(sender, recipient);
    return res.json(result);
  } catch (err) {
    logger.error(`Add friend error: ${err.message}`);
    next(err);
    return res.sendStatus(500);
  }
});

/**
 * /users/acceptfriend
 * Accept a pending friend request.
 * Only the intended recipient may confirm the request.
 */
router.put("/users/acceptfriend", auth.required, async (req, res, next) => {
  const token = getTokenFromHeader(req);
  let decoded;
  try {
    decoded = jwt.verify(token, process.env.SECRET);
  } catch (err) {
    logger.error(`Token verification error in acceptfriend: ${err.message}`);
    return res.sendStatus(401);
  }

  try {
    const friend = await validateFriendById(req.body.friendId);
    if (friend.confirmed) {
      return res.sendStatus(403);
    }
    if (friend.recipient.toString() !== decoded.id) {
      return res.sendStatus(401);
    }
    friend.confirmed = true;
    await friend.save();
    return res.sendStatus(200);
  } catch (err) {
    logger.error(`Accept friend error: ${err.message}`);
    next(err);
    return res.sendStatus(500);
  }
});

/**
 * /users/declinefriend
 * Decline a pending friend request.
 */
router.put("/users/declinefriend", auth.required, async (req, res, next) => {
  const token = getTokenFromHeader(req);
  let decoded;
  try {
    decoded = jwt.verify(token, process.env.SECRET);
  } catch (err) {
    logger.error(`Token verification error in declinefriend: ${err.message}`);
    return res.sendStatus(401);
  }

  try {
    // Call declineFriend with the friend request ID and current user ID.
    await declineFriend(req.body.friendId, decoded.id);
    return res.sendStatus(200);
  } catch (err) {
    logger.error(`Decline friend error: ${err.message}`);
    next(err);
    return res.sendStatus(500);
  }
});

/**
 * /users/cancelfriend
 * Cancel a sent friend request.
 */
router.put("/users/cancelfriend", auth.required, async (req, res, next) => {
  const token = getTokenFromHeader(req);
  let decoded;
  try {
    decoded = jwt.verify(token, process.env.SECRET);
  } catch (err) {
    logger.error(`Token verification error in cancelfriend: ${err.message}`);
    return res.sendStatus(401);
  }

  try {
    await cancelFriend(req.body.friendId, decoded.id);
    return res.sendStatus(200);
  } catch (err) {
    logger.error(`Cancel friend error: ${err.message}`);
    next(err);
    return res.sendStatus(500);
  }
});

/**
 * /users/removefriend
 * Remove an existing friend.
 */
router.put("/users/removefriend", auth.required, async (req, res, next) => {
  const token = getTokenFromHeader(req);
  let decoded;
  try {
    decoded = jwt.verify(token, process.env.SECRET);
  } catch (err) {
    logger.error(`Token verification error in removefriend: ${err.message}`);
    return res.sendStatus(401);
  }

  try {
    await removeFriend(req.body.friendId, decoded.id);
    return res.sendStatus(200);
  } catch (err) {
    logger.error(`Remove friend error: ${err.message}`);
    next(err);
    return res.sendStatus(500);
  }
});

export default router;
