import { Router } from "express";
import mime from "mime";
import path from "path";
import databaseServer from "../database/index.js";
import rateLimit from "express-rate-limit";

const router = Router();

const downloadLimiter = rateLimit({
        windowMs: 60 * 1000,
        max: 50,
        standardHeaders: true,
        legacyHeaders: false,
        message: { error: "Too many download requests, please try again later." },
});

router.get("/content/:filename", downloadLimiter, async (req, res) => {
        const bucket = databaseServer.gridfsBucket;
        if (!bucket) {
                return res.status(503).send("File store not ready");
        }

	const { filename } = req.params;
	const clean = path.basename(filename);

	if (clean !== filename || !/^[A-Za-z0-9._-]+$/.test(filename)) {
		return res.status(400).send("Invalid filename");
	}

	try {
		const downloadStream = bucket.openDownloadStreamByName(filename);

		res.setHeader("Content-Type", mime.getType(filename) || "application/octet-stream");

		downloadStream.on("error", () => res.sendStatus(404)).pipe(res);
	} catch (err) {
		console.error("GridFS download error:", err);
		res.sendStatus(500);
	}
});

export default router;
