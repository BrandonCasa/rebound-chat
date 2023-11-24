import { Router } from "express";
import auth from "../auth.js";
import UserModel from "../../models/User.js";
import passport from "passport";

const router = Router();

router.get("/users/profile", auth.required, function (req, res, next) {
  UserModel.findById(req.payload.id)
    .then(function (user) {
      if (!user) {
        return res.sendStatus(401);
      }

      return res.json({ user: user.toProfileJSON() });
    })
    .catch(next);
});

router.post("/users/login", function (req, res, next) {
  if (!req.body.user.email) {
    return res.status(422).json({ errors: { email: "is required" } });
  }

  if (!req.body.user.password) {
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
  user.setPassword(req.body.user.password);

  user
    .save()
    .then(function () {
      return res.json({ user: user.toAuthJSON() });
    })
    .catch((err) => {
      console.log(err);
      next(err);
    });
});

router.put("/users/modify", auth.required, function (req, res, next) {
  UserModel.findById(req.payload.id)
    .then(function (user) {
      if (!user) {
        return res.sendStatus(401);
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
    .catch(next);
});

export default router;
