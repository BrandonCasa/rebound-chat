import { Router } from "express";

import adminApi from "./admin.js";
import devApi from "./dev.js";
import usersApi from "./users.js";
import chatApi from "./chat.js";
import dmApi from "./dms.js";
import contentRoutes from "../content.js";
import mediaApi from "./media.js";
import multer from "multer";

const router = Router();

router.use("/", usersApi);

router.use("/", devApi);

router.use("/", adminApi);

router.use("/", chatApi);
router.use("/", dmApi);
router.use("/", mediaApi);

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
	if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
		return res.status(413).json({ error: "One of your files is too large." });
	}

	return next(err);
});

export default router;
