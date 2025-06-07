import { Router } from "express";

import adminApi from "./admin.js";
import devApi from "./dev.js";
import usersApi from "./users.js";
import contentRoutes from "../content.js";

const router = Router();

router.use("/", usersApi);

router.use("/", devApi);

router.use("/", adminApi);

router.use("/", contentRoutes);

router.use(function (err, req, res, next) {
  if (err.name === "ValidationError") {
    return res.status(422).json({
      errors: Object.keys(err.errors).reduce(function (errors, key) {
        errors[key] = err.errors[key].message;

        return errors;
      }, {}),
    });
  }

  return next(err);
});

export default router;
