import { Router } from "express";

import adminApi from "./admin.js";
import devApi from "./dev.js";
import usersApi from "./users.js";
import chatApi from "./chat.js";
import dmApi from "./dms.js";
import contentRoutes from "../content.js";
import mediaApi from "./media.js";
import databaseServer from "../../database/index.js";
import multer from "multer";

const router = Router();
const mongoBackedRoutes = Router();

const requireMongoDependency = (_req, res, next) => {
	if (databaseServer.isReady()) {
		return next();
	}

	return res.status(503).json({
		error: "This endpoint is temporarily unavailable until the Mongo-backed domain is migrated.",
		code: "mongo_dependency_unavailable",
	});
};

mongoBackedRoutes.use("/", usersApi);

mongoBackedRoutes.use("/", devApi);

mongoBackedRoutes.use("/", adminApi);

mongoBackedRoutes.use("/", chatApi);
mongoBackedRoutes.use("/", dmApi);
mongoBackedRoutes.use("/", mediaApi);

mongoBackedRoutes.use("/", contentRoutes);

router.use(requireMongoDependency, mongoBackedRoutes);

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
