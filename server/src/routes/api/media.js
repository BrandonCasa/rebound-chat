import { Router } from "express";
import { once } from "events";
import multer from "multer";

import databaseServer from "../../database/index.js";
import { auth } from "../auth.js";
import MediaModel from "../../models/Media/MediaAttachment.js";
import { buildRequestTokenDescriptor, createAuthContextMiddleware, parseCookieHeader, sanitizeIpAddress, resolveGoogleCallbackUrl } from "../../utils/auth.js";
import logger from "../../logger.js";

const router = Router();

const requireAuthContext = (context) => createAuthContextMiddleware(context, logger);

const MAX_FILE_SIZE = 16 * 1024 * 1024;
const MAX_MEDIA_ATTACHMENTS = 10;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_FILE_SIZE } });

const NIBBLE_POPCOUNT = [0, 1, 1, 2, 1, 2, 2, 3, 1, 2, 2, 3, 2, 3, 3, 4];

const generateStoredFilename = (userId, originalName) => {
	const ext = originalName.split(".").pop();
	return `media-${userId}-${Math.floor(Math.random() * 1000)}-${Date.now()}.${ext}`;
};

const uploadFileToGrid = async (bucket, file, filename) => {
	const uploadStream = bucket.openUploadStream(filename, { contentType: file.mimetype });
	uploadStream.end(file.buffer);
	await once(uploadStream, "finish");
};

const hexHammingDistance = (hexA = "", hexB = "") => {
	const minLength = Math.min(hexA.length, hexB.length);
	const maxLength = Math.max(hexA.length, hexB.length);

	let distance = 0;
	for (let i = 0; i < minLength; i++) {
		const nibbleA = parseInt(hexA[i], 16);
		const nibbleB = parseInt(hexB[i], 16);

		if (Number.isNaN(nibbleA) || Number.isNaN(nibbleB)) continue;

		const xor = nibbleA ^ nibbleB;
		distance += NIBBLE_POPCOUNT[xor];
	}

	distance += (maxLength - minLength) * 4;

	return distance;
};

router.post("/media/check", auth.required, requireAuthContext("Token verification error in media check."), async (req, res, next) => {
	const { hashes = [] } = req.body || {};

	if (!Array.isArray(hashes)) {
		return res.status(400).json({ error: "Payload must include an array of hashes." });
	}

	try {
		const coarseValues = hashes.map((entry) => entry?.coarse).filter((hash) => typeof hash === "string" && hash.length);

		const existingMedia = await MediaModel.find({
			perceptualHashCoarse: { $in: coarseValues },
		})
			.select("perceptualHashCoarse perceptualHashDense size contentType url originalName")
			.lean();

		const results = hashes.map((entry, index) => {
			if (!entry?.coarse || !entry?.fine) return { index, matches: [] };

			const coarseMatches = existingMedia.filter((media) => media.perceptualHashCoarse === entry.coarse);

			const matches = coarseMatches
				.map((media) => {
					const distance = hexHammingDistance(entry.fine, media.perceptualHashDense);
					const bitLength = Math.min(entry.fine.length, media.perceptualHashDense.length) * 4;
					const similarity = bitLength ? 100 - (distance / bitLength) * 100 : 0;
					return {
						_id: media._id,
						url: media.url,
						size: media.size,
						contentType: media.contentType,
						originalName: media.originalName,
						distance,
						similarity,
					};
				})
				.filter((candidate) => candidate.similarity >= 97); // within 3% hamming distance

			return { index, matches };
		});

		return res.json({ results });
	} catch (err) {
		return next(err);
	}
});

router.post(
	"/media/upload",
	auth.required,
	requireAuthContext("Token verification error in media upload."),
	upload.array("files", MAX_MEDIA_ATTACHMENTS),
	async (req, res, next) => {
		const bucket = databaseServer.gridfsBucket;
		if (!bucket) {
			return res.status(503).json({ error: "File store not ready." });
		}

		const files = req.files || [];
		if (!files.length) {
			return res.status(400).json({ error: "At least one file is required." });
		}

		let hashes = req.body?.hashes;
		if (typeof hashes === "string") {
			try {
				hashes = JSON.parse(hashes);
			} catch (err) {
				return res.status(400).json({ error: "Invalid hashes payload." });
			}
		}

		if (!Array.isArray(hashes) || hashes.length !== files.length) {
			return res.status(400).json({ error: "Hash metadata must match uploaded files." });
		}

		try {
			const attachments = [];

			for (let i = 0; i < files.length; i++) {
				const file = files[i];
				const hashEntry = hashes[i] || {};
				if (!hashEntry.coarse || !hashEntry.fine) {
					return res.status(400).json({ error: "Each upload must include coarse and fine hashes." });
				}

				const filename = generateStoredFilename(req.authContext.decoded.id, file.originalname);
				await uploadFileToGrid(bucket, file, filename);
				const url = `/content/${filename}`;

				const mediaDoc = await MediaModel.create({
					sender: req.authContext.decoded.id,
					contentType: file.mimetype,
					size: file.size,
					originalName: file.originalname,
					perceptualHashCoarse: hashEntry.coarse,
					perceptualHashDense: hashEntry.fine,
					url,
				});

				attachments.push({
					mediaId: mediaDoc._id,
					url: mediaDoc.url,
					size: mediaDoc.size,
					contentType: mediaDoc.contentType,
					originalName: mediaDoc.originalName,
				});
			}

			return res.json({ attachments });
		} catch (err) {
			return next(err);
		}
	}
);

export default router;
