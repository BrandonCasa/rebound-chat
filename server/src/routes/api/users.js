import { Router } from "express";
import { auth, getTokenFromHeader } from "../auth.js";
import UserModel from "../../models/User.js";
import FriendModel from "../../models/Friend.js";
import passport from "passport";
import jwt from "jsonwebtoken";
import logger from "../../logger.js";
import "dotenv/config";
import { sendFriendRequest, validateFriendById, validateUserById } from "../../models/helpers/UserHelper.js";

const router = Router();

router.get("/users/verify", async function (req, res, next) {
  const token = getTokenFromHeader(req);
  const decoded = await jwt.verify(token, process.env.SECRET, function (err, decoded) {
    if (err) {
      next(err);
      return res.sendStatus(500);
    }
    return decoded;
  });

  UserModel.findById(decoded.id)
    .then(function (user) {
      if (!user) {
        return res.sendStatus(401);
      }

      return res.json({ user: user.toAuthJSON() });
    })
    .catch((err) => {
      next(err);
      return res.sendStatus(500);
    });
});

router.get("/users/profile", auth.required, function (req, res, next) {
  UserModel.findById(req?.body?.id || req?.query?.id)
    .then(function (user) {
      if (!user) {
        return res.sendStatus(401);
      }

      return res.json({ user: user.toProfileJSON() });
    })
    .catch((err) => {
      next(err);
      return res.sendStatus(500);
    });
});

router.get("/users/login", function (req, res, next) {
  req.body = req.query;
  if (!req.body?.user?.email) {
    return res.status(422).json({ errors: { email: "is required" } });
  }

  if (!req.body?.user?.password) {
    return res.status(422).json({ errors: { password: "is required" } });
  }

  passport.authenticate("local", { session: false }, function (err, user, info) {
    if (err) {
      return next(err);
    }

    if (user) {
      user.token = user.generateJWT();
      return res.json({ user: user.toAuthJSON() });
    } else {
      return res.status(422).json(info);
    }
  })(req, res, next);
});

router.post("/users/register", function (req, res, next) {
  var password = req.body.user.password;
  if (!password || password.trim().length < 8) {
    return res.json({ errors: { password: "is invalid" } });
  }

  var user = new UserModel();

  user.username = req.body.user.username;
  user.email = req.body.user.email;
  user.displayName = req.body.user.displayName;
  user.bio = req.body.user.bio;
  user.setPassword(req.body.user.password);

  user
    .save()
    .then(function () {
      return res.json({ user: user.toAuthJSON() });
    })
    .catch((err) => {
      next(err);
      return res.sendStatus(500);
    });
});

router.put("/users/modify", auth.required, function (req, res, next) {
  const currentUserJwt = jwt.verify(getTokenFromHeader(req), process.env.SECRET, { algorithms: ["HS256"] });

  if (!currentUserJwt || !currentUserJwt?.id) {
    return res.sendStatus(404);
  }

  UserModel.findById(currentUserJwt.id)
    .then(function (user) {
      if (!user) {
        return res.sendStatus(404);
      }

      // only update fields that were actually passed...
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

      return user.save().then(function () {
        return res.json({ user: user.toAuthJSON() });
      });
    })
    .catch((err) => {
      next(err);
      return res.sendStatus(500);
    });
});

router.put("/users/addfriend", auth.required, async function (req, res, next) {
  const currentUserJwt = jwt.verify(getTokenFromHeader(req), process.env.SECRET, { algorithms: ["HS256"] });

  if (currentUserJwt.id === req.body.recipientId) {
    return res.sendStatus(403);
  }

  const sender = await validateUserById(currentUserJwt.id, res);
  const recipient = await validateUserById(req.body.recipientId, res);

  return await sendFriendRequest(sender, recipient, res);
});

router.put("/users/acceptfriend", auth.required, async function (req, res, next) {
  const currentUserJwt = jwt.verify(getTokenFromHeader(req), process.env.SECRET, { algorithms: ["HS256"] });

  if (!currentUserJwt || !currentUserJwt?.id) {
    return res.sendStatus(404);
  }

  const friend = await validateFriendById(req.body.friendId);

  if (friend.confirmed) {
    return res.sendStatus(403);
  }

  if (friend.recipient._id.toString() !== currentUserJwt.id) {
    return res.sendStatus(401);
  }

  friend.confirmed = true;
  await friend.save();

  return res.sendStatus(200);
});

router.put("/users/declinefriend", auth.required, async function (req, res, next) {
  const currentUserJwt = jwt.verify(getTokenFromHeader(req), process.env.SECRET, { algorithms: ["HS256"] });

  if (!currentUserJwt || !currentUserJwt?.id) {
    return res.sendStatus(404);
  }

  const friend = await validateFriendById(req.body.friendId);

  if (friend.confirmed) {
    return res.sendStatus(403);
  }

  if (friend.recipient._id.toString() !== currentUserJwt.id) {
    return res.sendStatus(401);
  }

  const sender = await validateUserById(friend.requester._id, res);
  const recipient = await validateUserById(friend.recipient._id, res);

  sender.friends.pull(req.body.friendId);
  await sender.save();
  recipient.friends.pull(req.body.friendId);
  await recipient.save();

  await friend.remove();

  return res.sendStatus(200);
});

router.put("/users/removefriend", auth.required, async function (req, res, next) {
  const currentUserJwt = jwt.verify(getTokenFromHeader(req), process.env.SECRET, { algorithms: ["HS256"] });

  if (!currentUserJwt || !currentUserJwt?.id) {
    return res.sendStatus(404);
  }

  const friend = await validateFriendById(req.body.friendId);

  if (friend.recipient._id.toString() !== currentUserJwt.id && friend.requester._id.toString() !== currentUserJwt.id) {
    return res.sendStatus(401);
  }

  if (!friend.confirmed) {
    return res.sendStatus(403);
  }

  const sender = await validateUserById(friend.requester._id, res);
  const recipient = await validateUserById(friend.recipient._id, res);

  sender.friends.pull(req.body.friendId);
  await sender.save();
  recipient.friends.pull(req.body.friendId);
  await recipient.save();

  await friend.remove();

  return res.sendStatus(200);
});

export default router;
